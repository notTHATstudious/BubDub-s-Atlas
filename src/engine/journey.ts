import type { Coords, Destination } from '../data/types'
import { roadKm, straightKm } from './geo'

// Rough door-to-door journey estimates. These are only used to decide how
// much of the first and last day is usable. They are never shown as
// schedules: the transport section links out to live search instead.

export type Mode = 'train' | 'bus' | 'flight' | 'car'
export type TransportPref = Mode | 'any'
export type TravelStyle = 'budget' | 'balanced' | 'premium'

export interface JourneyEstimate {
  mode: Mode
  hours: number
  /** Where the long-distance part ends, e.g. "Chandigarh" or "Bhuntar (Kullu)". */
  hub?: string
  /** Hours by road from the hub to the destination. */
  lastMileHours?: number
}

const TRAIN_KMPH = 60
const BUS_KMPH = 45
const CAR_KMPH = 50
const FLIGHT_KMPH = 700
/** Getting to the airport, check-in, security and baggage. */
const AIRPORT_OVERHEAD_HOURS = 3
const CONNECTION_HOURS = 3

const round = (h: number) => Math.round(h * 2) / 2

export function estimateMode(from: Coords, dest: Destination, mode: Mode): JourneyEstimate | undefined {
  const km = roadKm(from, dest.coords)
  const air = straightKm(from, dest.coords)
  const penalty = dest.access.roadPenaltyHours ?? 0
  switch (mode) {
    case 'train': {
      const rh = dest.access.railhead
      if (!rh) return undefined
      // The last road stretch covers part of the distance already.
      const railKm = Math.max(km - rh.roadHours * 40, 0)
      return { mode, hours: round(railKm / TRAIN_KMPH + rh.roadHours + 1), hub: rh.name, lastMileHours: rh.roadHours }
    }
    case 'bus': {
      if (km > 1500) return undefined
      return { mode, hours: round(km / BUS_KMPH + penalty) }
    }
    case 'car': {
      if (km > 2500) return undefined
      return { mode, hours: round(km / CAR_KMPH + penalty) }
    }
    case 'flight': {
      const ap = dest.access.airport
      if (!ap || air < 350) return undefined
      const connection = dest.access.connectingFlightLikely ? CONNECTION_HOURS : 0
      return {
        mode,
        hours: round(AIRPORT_OVERHEAD_HOURS + air / FLIGHT_KMPH + connection + ap.roadHours),
        hub: ap.name,
        lastMileHours: ap.roadHours,
      }
    }
  }
}

const MODE_NOUN: Record<Mode, string> = { train: 'trains', bus: 'buses', flight: 'flights', car: 'road travel' }

/**
 * Why a mode the person asked for can't be used for this trip, in words.
 * Mirrors the limits in estimateMode.
 */
export function unavailableReason(from: Coords | undefined, fromName: string, dest: Destination, mode: Mode): string {
  if (!from) return `we couldn't place ${fromName} on the map, so we can't compare ${MODE_NOUN[mode]}`
  const km = Math.round(roadKm(from, dest.coords) / 10) * 10
  const air = straightKm(from, dest.coords)
  switch (mode) {
    case 'train':
      return dest.access.lookupFailed
        ? `the railway station lookup didn't answer just now (try planning again in a minute)`
        : `we don't know a useful railway station near ${dest.name}`
    case 'bus':
      return `it's about ${km.toLocaleString('en-IN')} km by road, too far for a bus to make sense`
    case 'car':
      return `it's about ${km.toLocaleString('en-IN')} km by road, too far to drive in a trip like this`
    case 'flight':
      if (!dest.access.airport) return `there's no airport within easy reach of ${dest.name}`
      if (air < 350) return `${fromName} and ${dest.name} are only about ${km} km apart by road, too close for a flight to save time`
      return `no flight route fits this trip`
  }
}

export function estimateAll(from: Coords, dest: Destination): JourneyEstimate[] {
  const modes: Mode[] = ['train', 'bus', 'flight', 'car']
  return modes.map((m) => estimateMode(from, dest, m)).filter((e): e is JourneyEstimate => !!e)
}

/**
 * Picks the mode the itinerary is planned around. The transport section
 * still shows every option; this only sets realistic arrival times.
 */
export function pickPlanningMode(
  options: JourneyEstimate[],
  style: TravelStyle,
  pref: TransportPref,
): JourneyEstimate | undefined {
  if (options.length === 0) return undefined
  const byMode = (m: Mode) => options.find((o) => o.mode === m)
  if (pref !== 'any') {
    const chosen = byMode(pref)
    if (chosen) return chosen
  }
  const ground = [byMode('train'), byMode('bus')].filter((o): o is JourneyEstimate => !!o)
  const bestGround = ground.sort((a, b) => a.hours - b.hours)[0]
  const flight = byMode('flight')
  const car = byMode('car')
  switch (style) {
    case 'budget':
      return bestGround ?? car ?? flight
    case 'balanced':
      if (flight && (!bestGround || bestGround.hours - flight.hours >= 8)) return flight
      return bestGround ?? car ?? flight
    case 'premium':
      if (flight && (!car || car.hours - flight.hours >= 3)) return flight
      if (car && car.hours <= 12) return car
      return bestGround ?? car ?? flight
  }
}

/** Typical departure hour when the person hasn't given one. */
export function defaultDepartHour(j: JourneyEstimate): number {
  if (j.mode === 'flight') return 7
  if (j.mode === 'car') return 6
  if (j.hours < 6) return 7
  if (j.hours <= 16) return 20 // overnight train or bus, arrive next morning
  return 10
}

/** Typical hour to leave the destination on the last day. */
export function defaultReturnHour(j: JourneyEstimate): number {
  if (j.mode === 'flight') return 14
  if (j.mode === 'car') return j.hours <= 6 ? 15 : 7
  if (j.hours < 6) return 16
  if (j.hours <= 16) return 18 // overnight back home
  return 10
}

export const MODE_LABEL: Record<Mode, string> = {
  train: 'train',
  bus: 'bus',
  flight: 'flight',
  car: 'road',
}
