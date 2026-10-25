import type { PlaceKind } from '../data/types'
import type { TravelStyle } from './journey'
import type { TransportOption } from './transport'

// A rough trip budget in ₹ from typical Indian prices. It's a planning aid,
// not a quote: every line is a range, and the page labels it as an estimate.
//
// Basis (typical 2025–26 ranges, not live prices):
// - Getting there: per-km fares in transport.ts (IRCTC sleeper/3A/2A and
//   state bus fare levels, typical domestic economy fares, cab per-km rates).
// - Stays: common room rates on hotel listing sites for each style, two
//   people to a room.
// - Food: local eateries (Budget), casual restaurants (Balanced), hotel and
//   café dining (Premium).
// - Local travel: autos and shared jeeps (Budget), autos or an app cab for the
//   actual outing distance (Balanced), a private cab with driver (Premium).
// - Entry fees: ASI monuments ₹25–40 for Indian visitors, temples usually
//   free, museums and private palaces up to a few hundred, activities more.

export interface BudgetLine {
  label: string
  detail: string
  range: [number, number]
}

export interface Budget {
  lines: BudgetLine[]
  total: [number, number]
  perPerson: [number, number]
  travellers: number
  /** One line on where the figures come from, for the page. */
  basis: string
}

/** Per room per night: two people share a room. */
const STAY: Record<TravelStyle, [number, number]> = { budget: [800, 1500], balanced: [2000, 3500], premium: [5000, 10000] }
/** Per person per full day. */
const FOOD: Record<TravelStyle, [number, number]> = { budget: [400, 700], balanced: [600, 1200], premium: [1500, 3000] }
/** Getting around on outings. Budget: per person per km (shared autos, buses). Others: per vehicle per km. */
const LOCAL_PER_KM: Record<TravelStyle, [number, number]> = { budget: [2, 4], balanced: [15, 22], premium: [20, 28] }
/** Minimum local spend for a day out: per person (Budget) or per vehicle. */
const LOCAL_MIN: Record<TravelStyle, [number, number]> = { budget: [50, 100], balanced: [300, 500], premium: [1500, 2500] }
/** In-town hops on top of the outing distance. */
const IN_TOWN_KM = 6
const LOCAL_KMPH = 30
const ROAD_KMPH = 40
const BUS_PER_KM: [number, number] = [1.2, 2]
const CAB_PER_KM: [number, number] = [14, 19]

/** Typical entry fee per person, ₹. */
const ENTRY: Record<PlaceKind, [number, number]> = {
  viewpoint: [0, 50],
  fort: [25, 100],
  caves: [25, 100],
  lake: [0, 50],
  waterfall: [0, 50],
  village: [0, 0],
  monastery: [0, 50],
  temple: [0, 0],
  church: [0, 0],
  valley: [0, 100],
  pass: [0, 0],
  market: [0, 0],
  cafes: [0, 0],
  beach: [0, 0],
  trek: [0, 200],
  activity: [300, 1500],
  palace: [50, 300],
  museum: [20, 150],
  garden: [10, 50],
  heritage: [25, 100],
  wildlife: [100, 500],
}

const round = (n: number) => Math.round(n / 100) * 100
const mul = (r: [number, number], k: number): [number, number] => [r[0] * k, r[1] * k]
const add = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]]

export interface Outing {
  /** Furthest place from the stay, in hours by road. */
  farthestHours: number
  /** Kinds of the places visited, for entry fees. */
  kinds: PlaceKind[]
}

export interface BudgetInput {
  style: TravelStyle
  travellers: number
  nights: number
  /** Days counted for meals: travel, arrival and return days count partly. */
  foodDays: number
  /** One entry per day with sightseeing. */
  outings: Outing[]
  /** Road hours between stops. */
  transferHours: number
  outbound?: TransportOption
  inbound?: TransportOption
}

function legCost(o: TransportOption | undefined, travellers: number, cars: number): [number, number] | undefined {
  if (!o) return undefined
  return o.perCar ? mul(o.fare, cars) : mul(o.fare, travellers)
}

export function estimateBudget(b: BudgetInput): Budget {
  const n = Math.max(1, Math.round(b.travellers))
  const rooms = Math.ceil(n / 2)
  const cars = Math.ceil(n / 4)
  const lines: BudgetLine[] = []

  const out = legCost(b.outbound, n, cars)
  const back = legCost(b.inbound, n, cars)
  if (out || back) {
    const modes = [...new Set([b.outbound?.mode, b.inbound?.mode].filter(Boolean))].join(' / ')
    lines.push({ label: 'Getting there and back', detail: `${modes}, ${n} ${n === 1 ? 'person' : 'people'}`, range: add(out ?? [0, 0], back ?? [0, 0]) })
  }
  if (b.transferHours > 0) {
    const km = b.transferHours * ROAD_KMPH
    const range: [number, number] = b.style === 'budget' ? mul(BUS_PER_KM, km * n) : mul(CAB_PER_KM, km * cars)
    lines.push({ label: 'Between stops', detail: b.style === 'budget' ? 'buses' : `${cars} ${cars === 1 ? 'cab' : 'cabs'}`, range })
  }
  if (b.nights > 0) {
    lines.push({ label: 'Stays', detail: `${b.nights} ${b.nights === 1 ? 'night' : 'nights'}, ${rooms} ${rooms === 1 ? 'room' : 'rooms'}`, range: mul(STAY[b.style], b.nights * rooms) })
  }
  if (b.foodDays > 0) {
    lines.push({ label: 'Food', detail: `${n} ${n === 1 ? 'person' : 'people'}`, range: mul(FOOD[b.style], b.foodDays * n) })
  }
  if (b.outings.length > 0) {
    let local: [number, number] = [0, 0]
    let fees: [number, number] = [0, 0]
    for (const o of b.outings) {
      const km = 2 * o.farthestHours * LOCAL_KMPH + IN_TOWN_KM
      const per = mul(LOCAL_PER_KM[b.style], km)
      const min = LOCAL_MIN[b.style]
      const day: [number, number] = [Math.max(per[0], min[0]), Math.max(per[1], min[1])]
      local = add(local, b.style === 'budget' ? mul(day, n) : mul(day, cars))
      for (const k of o.kinds) fees = add(fees, mul(ENTRY[k], n))
    }
    const how = b.style === 'budget' ? 'autos, shared jeeps' : b.style === 'balanced' ? 'autos or a cab' : 'private cab'
    lines.push({ label: 'Local travel', detail: `${b.outings.length} ${b.outings.length === 1 ? 'day' : 'days'} out, ${how}`, range: local })
    if (fees[1] > 0) lines.push({ label: 'Entry fees and activities', detail: 'tickets where places charge', range: fees })
  }

  const rounded = lines.map((l) => ({ ...l, range: [round(l.range[0]), round(l.range[1])] as [number, number] }))
  const total = rounded.reduce<[number, number]>((s, l) => add(s, l.range), [0, 0])
  return {
    lines: rounded,
    total,
    perPerson: [round(total[0] / n), round(total[1] / n)],
    travellers: n,
    basis: 'Based on typical rail, bus and cab fares, hotel listing rates for this style, local food prices and standard entry fees. Not live prices.',
  }
}

export function formatRupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
