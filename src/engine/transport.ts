import type { Coords, Destination } from '../data/types'
import type { Origin } from './geo'
import { roadKm, straightKm } from './geo'
import { estimateAll, type JourneyEstimate, type Mode, type TravelStyle } from './journey'

// Ways to get there and back, for the transport section. We have no live
// schedules or fares (those need paid APIs), so each option carries a rough
// time, a rough fare range, and links that open real searches pre-filled.

export interface TransportLink {
  label: string
  url: string
}

export interface TransportOption {
  mode: Mode
  hours: number
  /** The plan's days are timed around this one. */
  recommended: boolean
  /** Short reason, for the recommended option. */
  why?: string
  /** The journey in plain steps, e.g. "Flight Mumbai → Bhuntar (KUU)". */
  steps: string[]
  /** Rough fare in ₹, one way: per person, or per car when `perCar`. */
  fare: [number, number]
  perCar?: boolean
  links: TransportLink[]
}

export interface LegEnd {
  name: string
  coords?: Coords
  airport?: string
}

const round100 = (n: number) => Math.max(100, Math.round(n / 100) * 100)
const range = (lo: number, hi: number): [number, number] => [round100(lo), round100(Math.max(hi, lo))]
const slug = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const enc = encodeURIComponent

/** Rough fare per km, ₹, per person (car: per vehicle). */
const PER_KM: Record<Mode, Record<TravelStyle, [number, number]>> = {
  train: { budget: [0.45, 0.7], balanced: [1.1, 1.6], premium: [1.8, 2.6] },
  bus: { budget: [1, 1.5], balanced: [1.4, 2], premium: [1.8, 2.6] },
  car: { budget: [12, 15], balanced: [13, 17], premium: [16, 22] },
  flight: { budget: [0, 0], balanced: [0, 0], premium: [0, 0] },
}
// Short hops are cheap: a local or passenger train is tens of rupees, a state bus about ₹100.
const MIN_FARE: Record<Mode, number> = { train: 50, bus: 100, car: 1200, flight: 2500 }
/** Last-mile road speed used to turn hours back into km. */
const LAST_MILE_KMPH = 40
const TAXI_PER_KM: [number, number] = [14, 20]

export const isIndia = (d: Destination) => d.source !== 'live' || /india/i.test(d.region)

function lastMileFare(hours: number, style: TravelStyle, travellers: number): [number, number] {
  const km = hours * LAST_MILE_KMPH
  if (style === 'budget') return [km * 2, km * 3.5] // shared jeep or local bus
  const share = Math.min(4, Math.max(1, travellers))
  return [(km * TAXI_PER_KM[0]) / share, (km * TAXI_PER_KM[1]) / share]
}

export function fareFor(e: JourneyEstimate, from: Coords, dest: Destination, style: TravelStyle, travellers: number): { fare: [number, number]; perCar?: boolean } {
  const km = roadKm(from, dest.coords)
  const lm = e.lastMileHours ? lastMileFare(e.lastMileHours, style, travellers) : [0, 0]
  if (e.mode === 'flight') {
    const air = straightKm(from, dest.coords)
    const connect = dest.access.connectingFlightLikely ? 1.25 : 1
    const lo = (3000 + 2.2 * air) * connect
    const hi = (5500 + 4 * air) * connect * (style === 'premium' ? 1.4 : 1)
    return { fare: range(lo + lm[0], hi + lm[1]) }
  }
  if (e.mode === 'car') {
    const [a, b] = PER_KM.car[style]
    return { fare: range(Math.max(MIN_FARE.car, km * a), Math.max(MIN_FARE.car, km * b)), perCar: true }
  }
  const [a, b] = PER_KM[e.mode][style]
  const mainKm = Math.max(km - (e.lastMileHours ?? 0) * LAST_MILE_KMPH, 0)
  return { fare: range(Math.max(MIN_FARE[e.mode], mainKm * a) + lm[0], Math.max(MIN_FARE[e.mode], mainKm * b) + lm[1]) }
}

const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 2) / 2} h`)

function stepsFor(e: JourneyEstimate, home: LegEnd, dest: Destination, outbound: boolean): string[] {
  const hub = e.hub ?? dest.name
  const code = dest.access.airport?.code
  let main: string
  let last: string | undefined
  switch (e.mode) {
    case 'flight': {
      const a = home.airport ? `${home.name} (${home.airport})` : home.name
      const b = code ? `${hub} airport (${code})` : hub
      main = `Flight ${outbound ? `${a} → ${b}` : `${b} → ${a}`}${dest.access.connectingFlightLikely ? ', usually with one connection' : ''}`
      break
    }
    case 'train':
      main = `Train ${outbound ? `${home.name} → ${hub}` : `${hub} → ${home.name}`}`
      break
    case 'bus':
      main = `Bus ${outbound ? `${home.name} → ${dest.name}` : `${dest.name} → ${home.name}`}${e.hours >= 8 ? ', usually overnight' : ''}`
      break
    case 'car':
      main = `By road ${outbound ? `${home.name} → ${dest.name}` : `${dest.name} → ${home.name}`}, own car or a hired cab`
      break
  }
  if (e.lastMileHours && e.lastMileHours >= 0.5 && hub !== dest.name) {
    last = outbound ? `Taxi or bus about ${fmtHours(e.lastMileHours)} from ${hub} to ${dest.name}` : `Taxi or bus about ${fmtHours(e.lastMileHours)} from ${dest.name} to ${hub}`
  }
  if (!last) return [main]
  return outbound ? [main, last] : [last, main]
}

function yymmdd(date: string) {
  return date.slice(2, 4) + date.slice(5, 7) + date.slice(8, 10)
}

export function mapsLink(from: LegEnd | Destination, to: LegEnd | Destination): TransportLink {
  const pt = (p: LegEnd | Destination) => (p.coords ? `${p.coords.lat},${p.coords.lon}` : p.name)
  return { label: 'Google Maps route', url: `https://www.google.com/maps/dir/?api=1&origin=${enc(pt(from))}&destination=${enc(pt(to))}&travelmode=driving` }
}

export function busLink(from: string, to: string): TransportLink {
  return { label: 'redBus', url: `https://www.redbus.in/bus-tickets/${slug(from)}-to-${slug(to)}` }
}

function linksFor(e: JourneyEstimate, home: LegEnd, dest: Destination, outbound: boolean, date: string, travellers: number): TransportLink[] {
  const india = isIndia(dest)
  const [a, b] = outbound ? [home, dest] : [dest, home]
  switch (e.mode) {
    case 'flight': {
      const destCode = dest.access.airport?.code
      const codeA = outbound ? home.airport : destCode
      const codeB = outbound ? destCode : home.airport
      const nameA = codeA ?? a.name
      const nameB = codeB ?? (outbound ? (e.hub ?? dest.name) : home.name)
      const links: TransportLink[] = [
        { label: 'Google Flights', url: `https://www.google.com/travel/flights?q=${enc(`Flights from ${nameA} to ${nameB} on ${date}`)}&hl=en` },
      ]
      if (codeA && codeB) {
        links.push({ label: 'Skyscanner', url: `https://www.skyscanner.co.in/transport/flights/${codeA.toLowerCase()}/${codeB.toLowerCase()}/${yymmdd(date)}/?adultsv2=${travellers}` })
      }
      return links
    }
    case 'train': {
      const hub = e.hub ?? dest.name
      const [x, y] = outbound ? [home.name, hub] : [hub, home.name]
      const links: TransportLink[] = [{ label: 'Find trains', url: `https://www.google.com/search?q=${enc(`trains from ${x} to ${y}`)}` }]
      if (india) links.push({ label: 'IRCTC', url: 'https://www.irctc.co.in/nget/train-search' })
      return links
    }
    case 'bus':
      return india ? [busLink(a.name, b.name)] : [{ label: 'Find buses', url: `https://www.google.com/search?q=${enc(`bus from ${a.name} to ${b.name}`)}` }]
    case 'car':
      return [mapsLink(a, b)]
  }
}

function whyFor(chosen: JourneyEstimate, all: JourneyEstimate[], style: TravelStyle): string {
  const slower = all.filter((o) => o.mode !== chosen.mode && o.hours - chosen.hours >= 2)
  const fastest = all.length > 1 && slower.length === all.length - 1
  if (chosen.mode === 'flight') return fastest ? `Fastest by far${slower[0] ? `, saves about ${fmtHours(Math.min(...slower.map((o) => o.hours)) - chosen.hours)}` : ''}.` : 'Saves the most time.'
  if (style === 'budget') return 'Cheapest sensible option for this distance.'
  if (chosen.mode === 'car') return 'Door to door and flexible, good value for a group.'
  return fastest ? 'Quickest here, and good value.' : 'Good balance of time and cost.'
}

export interface LegInput {
  home: Origin
  dest: Destination
  /** The estimate the plan is timed around. */
  chosen?: JourneyEstimate
  outbound: boolean
  date: string
  style: TravelStyle
  travellers: number
}

/** Every sensible way to make one leg, recommended first. */
export function legOptions({ home, dest, chosen, outbound, date, style, travellers }: LegInput): TransportOption[] {
  if (!home.coords || dest.source === 'placeholder') return []
  const all = estimateAll(home.coords, dest)
  // A gateway leg (e.g. Shimla → Spiti) is road only and comes in as `chosen`.
  if (chosen && !all.some((o) => o.mode === chosen.mode)) all.push(chosen)
  const options = all.map((e) => {
    const recommended = chosen?.mode === e.mode
    const { fare, perCar } = fareFor(e, home.coords!, dest, style, travellers)
    return {
      mode: e.mode,
      hours: recommended && chosen ? chosen.hours : e.hours,
      recommended,
      why: recommended ? whyFor(e, all, style) : undefined,
      steps: stepsFor(e, home, dest, outbound),
      fare,
      perCar,
      links: linksFor(e, home, dest, outbound, date, travellers),
    } satisfies TransportOption
  })
  return options.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.hours - b.hours)
}

/** "Compare every route" link that works anywhere. */
export function rome2rioLink(from: string, to: string): TransportLink {
  return { label: 'Rome2Rio (all routes)', url: `https://www.rome2rio.com/map/${enc(from)}/${enc(to)}` }
}
