import { describe, expect, it } from 'vitest'
import { customPlaceId, daySignature, planToText, planTrip, resolveCurated, whatsappLink, type TripInput } from '.'

const plan = (input: TripInput) => planTrip(input, resolveCurated(input))
const allPlaceIds = (p: ReturnType<typeof plan>) => p.days.flatMap((d) => d.stops.map((s) => s.placeId))

describe('planTrip', () => {
  it('makes one day per calendar day, starting and ending with travel', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali'], departDate: '2026-12-24', returnDate: '2026-12-28', departTime: '21:00', style: 'budget' })
    expect(p.totalDays).toBe(5)
    expect(p.days).toHaveLength(5)
    expect(p.title).toBe('MUMBAI → MANALI')
    expect(p.days[0].type).toBe('travel')
    expect(p.days.at(-1)!.type).toBe('return')
  })

  it('keeps the day after a long overnight journey light', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali'], departDate: '2026-12-24', returnDate: '2026-12-29', style: 'budget' })
    const arrival = p.days.find((d) => d.type === 'arrival')!
    expect(arrival.capacityHours).toBeLessThanOrEqual(4)
  })

  it('never plans the same place twice', () => {
    const p = plan({ from: 'Mumbai', stops: ['Spiti'], departDate: '2027-07-10', returnDate: '2027-07-20' })
    const ids = allPlaceIds(p)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('routes Spiti through Manali in summer and visits Chandratal on the way', () => {
    const p = plan({ from: 'Mumbai', stops: ['Spiti'], departDate: '2027-07-10', returnDate: '2027-07-20' })
    expect(p.route.map((r) => r.id)).toEqual(['manali', 'spiti', 'manali'])
    const transfer = p.days.find((d) => d.type === 'transfer' && d.stopId === 'spiti')!
    expect(transfer.stops.some((s) => s.placeId === 'chandratal' && s.enRoute)).toBe(true)
    expect(transfer.notes.join(' ')).toMatch(/acclimatise/)
  })

  it('routes Spiti through Shimla in winter, with an overnight halt', () => {
    const p = plan({ from: 'Delhi', stops: ['Spiti'], departDate: '2027-01-10', returnDate: '2027-01-20' })
    expect(p.route[0].id).toBe('shimla')
    expect(p.route[1].transit).toBe(true)
    expect(p.route[1].name).toMatch(/Kalpa/)
    expect(allPlaceIds(p)).not.toContain('chandratal')
  })

  it('warns and suggests alternatives when Spiti is too far for the dates', () => {
    const p = plan({ from: 'Mumbai', stops: ['Spiti'], departDate: '2027-07-10', returnDate: '2027-07-13', style: 'budget' })
    expect(p.warnings.some((w) => w.level === 'avoid')).toBe(true)
    expect(p.suggestions.join(' ')).toMatch(/needs about \d+ days/)
  })

  it('supports a same-day trip', () => {
    const p = plan({ from: 'Mumbai', stops: ['Lonavala'], departDate: '2027-07-10', returnDate: '2027-07-10' })
    expect(p.days).toHaveLength(1)
    expect(p.days[0].stops.length).toBeGreaterThan(0)
    expect(p.days[0].summary).toMatch(/Leave Lonavala/)
  })

  it('drops later stops that do not fit and says so', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali', 'Kasol', 'Shimla'], departDate: '2027-04-10', returnDate: '2027-04-13', style: 'premium' })
    expect(p.droppedStops.length).toBeGreaterThan(0)
    expect(p.warnings.some((w) => /left out/.test(w.text))).toBe(true)
  })

  it('keeps every stop on tight dates by trimming nights', () => {
    const p = plan({ from: 'Mumbai', stops: ['Shimla', 'Spiti'], departDate: '2026-11-10', returnDate: '2026-11-17' })
    expect(p.droppedStops).toEqual([])
    expect(p.route.map((r) => r.id)).toContain('spiti')
  })

  it('offers a return date that fits every stop when one is left out', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali', 'Kasol', 'Shimla'], departDate: '2027-04-10', returnDate: '2027-04-13' })
    expect(p.droppedStops).toHaveLength(1)
    expect(p.extendTo! > '2027-04-13').toBe(true)
    expect(p.warnings[0].text).toMatch(/head back on/)
  })

  it('plans a multi-stop trip with a transfer day', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali', 'Kasol'], departDate: '2027-04-10', returnDate: '2027-04-17' })
    expect(p.title).toBe('MUMBAI → MANALI → KASOL → MUMBAI')
    expect(p.days.some((d) => d.type === 'transfer' && d.title === 'Manali → Kasol')).toBe(true)
  })

  it('skips places closed in that month', () => {
    const p = plan({ from: 'Delhi', stops: ['Manali'], departDate: '2027-01-05', returnDate: '2027-01-10' })
    expect(allPlaceIds(p)).not.toContain('rohtang')
  })

  it('respects excluded places and includes custom ones', () => {
    const p = plan({
      from: 'Pune',
      stops: ['Lonavala'],
      departDate: '2027-08-01',
      returnDate: '2027-08-02',
      excludedPlaceIds: ['tigers-leap'],
      customPlaces: [{ stopId: 'lonavala', name: 'Friend’s farmhouse' }],
    })
    const ids = allPlaceIds(p)
    expect(ids).not.toContain('tigers-leap')
    expect(p.days.flatMap((d) => d.stops).some((s) => s.custom && s.name === 'Friend’s farmhouse')).toBe(true)
  })

  it('includes places mentioned in the notes', () => {
    const p = plan({ from: 'Mumbai', stops: ['Lonavala'], departDate: '2027-11-01', returnDate: '2027-11-02', notes: 'we must do Rajmachi Fort trek please' })
    expect(allPlaceIds(p)).toContain('rajmachi-fort')
  })

  it('leans on interests', () => {
    const p = plan({ from: 'Mumbai', stops: ['Goa'], departDate: '2027-12-01', returnDate: '2027-12-04', interests: ['beaches'] })
    const kinds = p.days.flatMap((d) => d.stops).filter((s) => /beach/i.test(s.name))
    expect(kinds.length).toBeGreaterThanOrEqual(2)
  })

  it('does not overload any day', () => {
    const p = plan({ from: 'Mumbai', stops: ['Udaipur'], departDate: '2027-11-01', returnDate: '2027-11-05' })
    for (const d of p.days) {
      expect(d.stops.length).toBeLessThanOrEqual(4)
      const hours = d.stops.reduce((s, x) => s + x.visitHours, 0)
      expect(hours).toBeLessThanOrEqual(d.capacityHours)
    }
  })

  it('handles destinations it knows nothing about', () => {
    const p = plan({ from: 'Bengaluru', stops: ['Somewhere Small'], departDate: '2027-01-10', returnDate: '2027-01-12' })
    expect(p.days).toHaveLength(3)
    expect(p.warnings.some((w) => /couldn't estimate/i.test(w.text))).toBe(true)
  })

  it('rejects a return date before departure', () => {
    expect(() => plan({ from: 'Mumbai', stops: ['Goa'], departDate: '2027-12-05', returnDate: '2027-12-01' })).toThrow()
  })

  it('lists transport options with search links and a rough budget', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali', 'Kasol'], departDate: '2026-12-20', returnDate: '2026-12-26', travellers: 2 })
    const out = p.outbound.options!
    expect(out.filter((o) => o.recommended)).toHaveLength(1)
    expect(out[0].recommended).toBe(true)
    expect(out.map((o) => o.mode)).toEqual(expect.arrayContaining(['flight', 'train']))
    const flight = out.find((o) => o.mode === 'flight')!
    expect(flight.links.some((l) => l.url.includes('skyscanner.co.in/transport/flights/bom/kuu/261220'))).toBe(true)
    expect(flight.fare[0]).toBeLessThan(flight.fare[1])
    expect(p.inbound.options![0].steps[0]).toMatch(/from Kasol/)
    expect(p.days.find((d) => d.type === 'transfer')?.transfer?.links.length).toBeGreaterThan(0)
    const b = p.budget!
    expect(b.lines.map((l) => l.label)).toContain('Stays')
    expect(b.total[0]).toBeGreaterThan(0)
    expect(b.perPerson[1]).toBeCloseTo(b.total[1] / 2, -3)
  })

  it('applies edits: remove, include, move and custom places', () => {
    const base = { from: 'Mumbai', stops: ['Manali'], departDate: '2026-12-20', returnDate: '2026-12-25' }
    const first = plan(base)
    const planned = first.days.flatMap((d) => d.stops).filter((x) => !x.enRoute)
    const victim = planned[0]
    const removed = plan({ ...base, excludedPlaceIds: [victim.placeId] })
    expect(removed.days.flatMap((d) => d.stops).some((x) => x.placeId === victim.placeId)).toBe(false)

    const short = { ...base, returnDate: '2026-12-22' }
    const extra = Object.values(plan(short).leftovers).flat()[0]
    const included = plan({ ...short, includedPlaceIds: [extra.placeId] })
    expect(included.days.flatMap((d) => d.stops).some((x) => x.placeId === extra.placeId)).toBe(true)

    const from = first.days.find((d) => d.stops.some((x) => x.placeId === victim.placeId))!
    const to = first.days.find((d) => d !== from && d.stopId === from.stopId && d.type !== 'travel')!
    const moved = plan({ ...base, moves: { [victim.placeId]: to.day } })
    expect(moved.days[to.day - 1].stops.some((x) => x.placeId === victim.placeId)).toBe(true)
    expect(moved.days[from.day - 1].stops.some((x) => x.placeId === victim.placeId)).toBe(false)

    const custom = plan({ ...base, customPlaces: [{ stopId: 'manali', name: 'Cafe 1947' }] })
    expect(custom.days.flatMap((d) => d.stops).find((x) => x.name === 'Cafe 1947')?.placeId).toBe(customPlaceId('manali', 'Cafe 1947'))
  })

  it('writes a plain-text plan for WhatsApp, using day text edits that still fit', () => {
    const p = plan({ from: 'Mumbai', stops: ['Manali'], departDate: '2026-12-24', returnDate: '2026-12-28', travellers: 2, style: 'budget' })
    const d2 = p.days[1]
    const text = planToText(p, { 2: { title: 'Snow day', summary: 'Solang and chill.', sig: daySignature(d2) }, 3: { title: 'Stale', summary: 'x', sig: 'nope' } })
    expect(text.startsWith('MUMBAI → MANALI')).toBe(true)
    expect(text).toMatch(/Duration: 5 days/)
    expect(text).toMatch(/Travel style: Budget/)
    expect(text).toMatch(/\nGOING\nMumbai → Manali/)
    expect(text).toMatch(/DAY 2 — SNOW DAY \(25 Dec\)\nSolang and chill\./)
    expect(text).not.toMatch(/STALE/)
    expect(text).toMatch(/\nRETURN\nManali → Mumbai/)
    expect(text).toMatch(/BUDGET \(rough estimate\)/)
    expect(text).not.toMatch(/[*#]/)
    expect(planToText(p, {}, 'itinerary')).not.toMatch(/GOING/)
    expect(whatsappLink('a b')).toBe('https://wa.me/?text=a%20b')
  })

  it('keeps a weekend budget realistic (Lonavala, 2 days)', () => {
    const base = { from: 'Mumbai', stops: ['Lonavala'], departDate: '2026-11-07', returnDate: '2026-11-08', travellers: 2 }
    const pp = (style: 'budget' | 'balanced' | 'premium') => plan({ ...base, style }).budget!.perPerson
    const balanced = pp('balanced')
    expect(balanced[0]).toBeGreaterThanOrEqual(1500)
    expect(balanced[1]).toBeLessThanOrEqual(6000)
    expect(pp('budget')[1]).toBeLessThan(balanced[1])
    expect(pp('premium')[0]).toBeGreaterThan(balanced[0])
    const b = plan(base).budget!
    expect(b.basis).toMatch(/Not live prices/)
    // Every line is rounded to ₹100.
    expect(b.lines.every((l) => l.range[0] % 100 === 0)).toBe(true)
  })

  it('scales the budget with the traveller count', () => {
    const base = { from: 'Mumbai', stops: ['Lonavala'], departDate: '2026-11-07', returnDate: '2026-11-08' }
    const two = plan({ ...base, travellers: 2 }).budget!
    const five = plan({ ...base, travellers: 5 }).budget!
    expect(five.travellers).toBe(5)
    expect(five.total[0]).toBeGreaterThan(two.total[0])
    expect(five.lines.find((l) => l.label === 'Stays')!.detail).toMatch(/3 rooms/)
    expect(five.lines.find((l) => l.label === 'Getting there and back')!.detail).toMatch(/5 people/)
  })

  it('plans around the preferred transport, or says specifically why not', () => {
    const base = { from: 'Mumbai', stops: ['Manali'], departDate: '2026-07-07', returnDate: '2026-07-14' }
    const train = plan({ ...base, transport: 'train' })
    expect(train.outbound.estimate?.mode).toBe('train')
    expect(train.inbound.estimate?.mode).toBe('train')
    expect(train.outbound.options![0]).toMatchObject({ mode: 'train', recommended: true, why: 'Your preferred transport.' })
    expect(train.warnings.some((w) => /asked for/.test(w.text))).toBe(false)

    const bus = plan({ ...base, transport: 'bus' })
    expect(bus.outbound.estimate?.mode).not.toBe('bus')
    expect(bus.warnings.find((w) => /asked for buses/.test(w.text))?.text).toMatch(/km by road, too far for a bus/)

    const flight = plan({ from: 'Pune', stops: ['Lonavala'], departDate: '2026-07-07', returnDate: '2026-07-08', transport: 'flight' })
    expect(flight.warnings.find((w) => /asked for flights/.test(w.text))?.text).toMatch(/too close for a flight/)
  })
})
