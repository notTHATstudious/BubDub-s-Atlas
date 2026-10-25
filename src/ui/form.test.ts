import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findOrigin } from '../engine/geo'
import { deleteTrip, listTrips, rememberPlaces, saveTrip } from './store'
import { installKind } from './install'
import { resolveOffline, PlanError } from './lookup'
import { emptyForm, parseTravellers, toInput } from './form'

describe('traveller count', () => {
  it('accepts a cleared and retyped number instead of snapping back to 1', () => {
    expect(parseTravellers('')).toBeUndefined()
    expect(parseTravellers('4')).toBe(4)
    expect(parseTravellers('12')).toBe(12)
    expect(parseTravellers('0')).toBeUndefined()
    expect(parseTravellers('31')).toBeUndefined()
    expect(parseTravellers('2.5')).toBeUndefined()
  })

  it('passes the count to the planner', () => {
    expect(toInput({ ...emptyForm(), travellers: 6 }).travellers).toBe(6)
  })
})

describe('offline planning', () => {
  const input = (stops: string[], from = 'Mumbai') => ({ from, stops, departDate: '2026-11-07', returnDate: '2026-11-09' })

  it('plans hand-checked places and labels the plan as offline', () => {
    const r = resolveOffline(input(['Lonavala']))
    expect(r.stops[0].id).toBe('lonavala')
    expect(r.notices[0].text).toMatch(/Planned offline/)
  })

  it('refuses other places with a clear message', () => {
    expect(() => resolveOffline(input(['Hampi']))).toThrow(PlanError)
    expect(() => resolveOffline(input(['Hampi']))).toThrow(/offline, so "Hampi" can't be looked up/)
    expect(() => resolveOffline(input(['Goa'], 'Some Village'))).toThrow(/can't find "Some Village"/)
  })
})

describe('remembered places and saved trips', () => {
  const mem = new Map<string, string>()
  const stub = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('localStorage', stub)
  })
  afterEach(() => vi.unstubAllGlobals())

  const input = { ...toInput({ ...emptyForm(), from: { name: 'Mumbai' }, stops: [{ name: 'Gokarna Town' }] }) }
  const live = {
    id: 'live:gokarna', name: 'Gokarna', source: 'live' as const, region: 'Karnataka, India', coords: { lat: 14.55, lon: 74.32 },
    minNights: 1, idealNights: 2, bestMonths: [], access: {}, clusters: {}, places: [],
  }

  it('refuses an unknown place offline until it has been looked up online', () => {
    expect(() => resolveOffline(input)).toThrow(PlanError)
    rememberPlaces(input, { origin: findOrigin('Mumbai'), returnTo: findOrigin('Mumbai'), stops: [live], notices: [] })
    expect(resolveOffline(input).stops[0].name).toBe('Gokarna')
  })

  it('saves, lists, updates and deletes trips', () => {
    const trip = { id: 'a', savedAt: 1, label: 'Goa from Pune', dates: 'x', form: emptyForm(), edits: {}, resolved: { origin: findOrigin('Pune'), returnTo: findOrigin('Pune'), stops: [], notices: [] } }
    expect(saveTrip(trip)).toBe(true)
    expect(saveTrip({ ...trip, label: 'Goa again' })).toBe(true)
    expect(listTrips().map((t) => t.label)).toEqual(['Goa again'])
    deleteTrip('a')
    expect(listTrips()).toEqual([])
  })
})

describe('install hint', () => {
  const base = { platform: 'Linux armv8l', maxTouchPoints: 5, standalone: false }
  it('tells iPhones, iPads and Android apart', () => {
    expect(installKind({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe('ios')
    expect(installKind({ ...base, platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('ios')
    expect(installKind({ ...base, userAgent: 'Mozilla/5.0 (Linux; Android 13)' })).toBe('android')
    expect(installKind({ ...base, platform: 'MacIntel', maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Macintosh)' })).toBe('none')
  })
  it('stays quiet once installed', () => {
    expect(installKind({ ...base, standalone: true, userAgent: 'iPhone' })).toBe('none')
  })
})
