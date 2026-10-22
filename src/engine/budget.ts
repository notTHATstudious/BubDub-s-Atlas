import type { TravelStyle } from './journey'
import type { TransportOption } from './transport'

// A rough trip budget in ₹ from typical Indian prices. It's a planning aid,
// not a quote: every line is a range, and the page labels it as an estimate.

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
}

/** Per room per night: two people share a room. */
const STAY: Record<TravelStyle, [number, number]> = { budget: [900, 1800], balanced: [2200, 4500], premium: [6000, 12000] }
/** Per person per day. */
const FOOD: Record<TravelStyle, [number, number]> = { budget: [500, 900], balanced: [1000, 1700], premium: [2200, 4000] }
/** Getting around on a sightseeing day: per person when budget (buses, shared jeeps), per car otherwise. */
const LOCAL: Record<TravelStyle, [number, number]> = { budget: [300, 700], balanced: [2500, 3500], premium: [3500, 5500] }
/** Entry tickets, activities and small extras, per person per sightseeing day. */
const EXTRAS: Record<TravelStyle, [number, number]> = { budget: [100, 300], balanced: [300, 700], premium: [700, 1500] }
const ROAD_KMPH = 40
const BUS_PER_KM: [number, number] = [1.2, 2]
const CAB_PER_KM: [number, number] = [14, 19]

const round = (n: number) => Math.round(n / 500) * 500
const mul = (r: [number, number], k: number): [number, number] => [r[0] * k, r[1] * k]
const add = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]]

export interface BudgetInput {
  style: TravelStyle
  travellers: number
  nights: number
  days: number
  /** Days with sightseeing at a destination. */
  outingDays: number
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
  const n = Math.max(1, b.travellers)
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
  lines.push({ label: 'Food', detail: `${b.days} ${b.days === 1 ? 'day' : 'days'}`, range: mul(FOOD[b.style], b.days * n) })
  if (b.outingDays > 0) {
    const local = b.style === 'budget' ? mul(LOCAL.budget, b.outingDays * n) : mul(LOCAL[b.style], b.outingDays * cars)
    lines.push({ label: 'Local travel and entry fees', detail: `${b.outingDays} sightseeing ${b.outingDays === 1 ? 'day' : 'days'}`, range: add(local, mul(EXTRAS[b.style], b.outingDays * n)) })
  }

  const rounded = lines.map((l) => ({ ...l, range: [round(l.range[0]), round(l.range[1])] as [number, number] }))
  const total = rounded.reduce<[number, number]>((s, l) => add(s, l.range), [0, 0])
  return { lines: rounded, total, perPerson: [round(total[0] / n), round(total[1] / n)], travellers: n }
}

export function formatRupees(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
