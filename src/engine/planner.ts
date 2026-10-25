import type { Coords, Destination, Gateway, Interest, Month, Place } from '../data/types'
import { addDays, daysBetween, formatDate, formatHour, formatMonths, isValidDate, monthName, monthOf, parseTime } from './dates'
import { findDestinationById, getDestination, roadKm, type Origin } from './geo'
import {
  defaultDepartHour,
  defaultReturnHour,
  estimateAll,
  MODE_LABEL,
  pickPlanningMode,
  unavailableReason,
  type Mode,
  type JourneyEstimate,
  type TransportPref,
  type TravelStyle,
} from './journey'
import { estimateBudget } from './budget'
import { busLink, isIndia, legOptions, mapsLink } from './transport'
import type { DayPlan, DayType, JourneyLeg, Notice, PlannedStop, ResolvedTrip, RouteStop, TripInput, TripPlan } from './types'

// ─── Planning rules (tunable) ───────────────────────────────────────────────
const DAY_START = 9 // sightseeing usually starts around 9:00
const DAY_END = 19.5 // and winds down by 19:30
const FULL_DAY_HOURS = 8 // leaves room for meals, rest and delays
const LIGHT_DAY_HOURS = 4 // after an overnight journey
const TRANSFER_START = 8 // leave for the next stop around 8:00
const HIGH_ALTITUDE_M = 3000
const PREF_NOUN: Record<Mode, string> = { train: 'trains', bus: 'buses', flight: 'flights', car: 'road travel' }

/** A gateway leg (Manali → Spiti) is driven whatever the person prefers. */
function firstLegIsRoadOnly(dest: Destination, est: JourneyEstimate | undefined): boolean {
  return est?.mode === 'car' && !!dest.gateways?.length
}
/** Share of a day's meals eaten at the destination, by day type. */
const FOOD_DAY_SHARE: Record<DayType, number> = { travel: 0.5, arrival: 0.75, explore: 1, free: 1, daytrip: 1, transfer: 1, return: 0.75 }
const MAX_PLACES_PER_DAY = 4
const MAX_OUTINGS_PER_DAY = 3
const HOP_HOURS = 0.25 // between places on the same outing
const ROAD_KMPH = 45 // for road legs without a curated time
const LONG_JOURNEY_HOURS = 8

// ─── Route building ─────────────────────────────────────────────────────────

interface RouteNode {
  dest: Destination
  transit: boolean
  /** Rough road hours from the previous stop. */
  legIn?: number
  /** Place ids to visit on the way in. */
  enRoute: string[]
  /** Set on the requested stop that this gateway leads to. */
  gateway?: Gateway
}

function haltDestination(name: string): Destination {
  return {
    id: `halt:${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    name,
    source: 'placeholder',
    region: '',
    coords: { lat: 0, lon: 0 },
    minNights: 1,
    idealNights: 1,
    bestMonths: [],
    access: {},
    clusters: {},
    places: [],
  }
}

function pickGateway(dest: Destination, month: Month, warnings: Notice[]): Gateway {
  const gateways = dest.gateways!
  const open = gateways.find((g) => !g.openMonths || g.openMonths.includes(month))
  if (open) return open
  warnings.push({
    level: 'avoid',
    text: `Roads into ${dest.name} are usually closed in ${monthName(month)}. Check road status before planning this trip.`,
  })
  return gateways[0]
}

function buildRoute(origin: Origin, returnTo: Origin, stops: Destination[], month: Month, warnings: Notice[]): RouteNode[] {
  const route: RouteNode[] = []
  let prevId = origin.id
  for (const dest of stops) {
    if (dest.gateways?.length) {
      const direct = dest.gateways.find((g) => g.via === prevId)
      const g = direct ?? pickGateway(dest, month, warnings)
      if (!direct) {
        route.push({ dest: getDestination(g.via), transit: true, enRoute: [] })
      }
      if (g.overnightHalt) {
        route.push({ dest: haltDestination(g.overnightHalt), transit: true, legIn: g.roadHours / 2, enRoute: [] })
      }
      route.push({
        dest,
        transit: false,
        legIn: g.overnightHalt ? g.roadHours / 2 : g.roadHours,
        enRoute: g.enRoute ?? [],
        gateway: g,
      })
    } else {
      route.push({ dest, transit: false, enRoute: [] })
    }
    prevId = dest.id
  }
  // Come back out the same way when the last stop is only reachable via a gateway.
  const last = route.at(-1)
  if (last?.gateway && last.gateway.via !== returnTo.id) {
    const g = last.gateway
    if (g.overnightHalt) {
      route.push({ dest: haltDestination(g.overnightHalt), transit: true, legIn: g.roadHours / 2, enRoute: [] })
    }
    route.push({ dest: getDestination(g.via), transit: true, legIn: g.overnightHalt ? g.roadHours / 2 : g.roadHours, enRoute: [] })
  }
  // Fill in road times for the remaining legs.
  for (let i = 1; i < route.length; i++) {
    route[i].legIn ??= roadLegHours(route[i - 1].dest, route[i].dest)
  }
  return route
}

function roadLegHours(a: Destination, b: Destination): number {
  const link = a.links?.find((l) => l.to === b.id) ?? b.links?.find((l) => l.to === a.id)
  if (link) return link.roadHours
  if (a.source === 'placeholder' || b.source === 'placeholder') return 4
  const penalty = Math.max(a.access.roadPenaltyHours ?? 0, b.access.roadPenaltyHours ?? 0)
  return Math.round((roadKm(a.coords, b.coords) / ROAD_KMPH + penalty) * 2) / 2
}

// ─── Nights ─────────────────────────────────────────────────────────────────

function requiredNights(node: RouteNode, userStopCount: number, tight = false): number {
  if (node.transit) return 1
  // When dates are short, a stop can make do with one night, or two up high
  // where the first day is for acclimatising.
  if (tight) return (node.dest.altitudeM ?? 0) >= HIGH_ALTITUDE_M ? Math.min(2, Math.max(1, node.dest.minNights)) : 1
  return userStopCount > 1 ? Math.max(1, node.dest.minNights) : node.dest.minNights
}

/** Splits the available nights between stops: minimums first, then towards ideal. */
function allocateNights(route: RouteNode[], available: number, tight = false): number[] {
  const userCount = route.filter((n) => !n.transit).length
  const nights = route.map(() => 0)
  let left = available
  // Transit stops first: you can't skip the night in Manali on the way to Spiti.
  route.forEach((n, i) => {
    if (n.transit && left > 0) {
      nights[i] = 1
      left--
    }
  })
  route.forEach((n, i) => {
    if (n.transit) return
    const give = Math.min(requiredNights(n, userCount, tight), left)
    nights[i] += give
    left -= give
  })
  const users = route.map((n, i) => ({ n, i })).filter((x) => !x.n.transit)
  // Towards ideal, one night at a time to the stop furthest from it.
  while (left > 0) {
    const short = users
      .filter((x) => nights[x.i] < x.n.dest.idealNights)
      .sort((a, b) => a.n.dest.idealNights - nights[a.i] - (b.n.dest.idealNights - nights[b.i]))
      .at(-1)
    if (!short) break
    nights[short.i]++
    left--
  }
  // Anything beyond ideal goes to the stop with the most to see. Real
  // transit towns (Manali on the way to Spiti) count too: a spare night there
  // is a good buffer.
  const extras = route.map((n, i) => ({ n, i })).filter((x) => x.n.dest.source !== 'placeholder' || !x.n.transit)
  while (left > 0 && extras.length > 0) {
    const roomiest = [...extras].sort((a, b) => b.n.dest.places.length / (nights[b.i] + 1) - a.n.dest.places.length / (nights[a.i] + 1))[0]
    nights[roomiest.i]++
    left--
  }
  return nights
}

// ─── Journeys ───────────────────────────────────────────────────────────────

function journeyOptions(from: Origin | Destination, to: Destination): JourneyEstimate[] {
  if (to.source === 'placeholder') return []
  const coords = 'source' in from && from.source === 'placeholder' ? undefined : from.coords
  if (!coords) return []
  return estimateAll(coords, to)
}

// ─── Places ─────────────────────────────────────────────────────────────────

interface Candidate {
  place: Place
  score: number
  mustInclude: boolean
  custom: boolean
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function mentionedIn(notes: string | undefined, place: Place): boolean {
  if (!notes) return false
  const n = ` ${normalize(notes)} `
  const name = normalize(place.name.replace(/\(.*?\)/g, ''))
  return name.length >= 4 && n.includes(` ${name} `)
}

function scorePlace(place: Place, interests: Interest[]): number {
  // Highlights get a bonus so one big sight beats several minor ones.
  let score = place.priority + (place.priority === 3 ? 1 : 0)
  if (interests.length > 0) {
    const hits = place.interests.filter((i) => interests.includes(i)).length
    score += hits > 0 ? 1.5 * hits : -1
  }
  return score
}

function candidatesFor(dest: Destination, input: TripInput, month: Month): { list: Candidate[]; closed: Place[] } {
  const interests = input.interests ?? []
  const excluded = new Set(input.excludedPlaceIds ?? [])
  const included = new Set(input.includedPlaceIds ?? [])
  const closed: Place[] = []
  const list: Candidate[] = []
  for (const place of dest.places) {
    if (excluded.has(place.id)) continue
    if (place.closedMonths?.includes(month)) {
      closed.push(place)
      continue
    }
    const must = mentionedIn(input.notes, place) || included.has(place.id)
    list.push({ place, score: scorePlace(place, interests) + (must ? 10 : 0), mustInclude: must, custom: false })
  }
  ;(input.customPlaces ?? [])
    .filter((c) => c.stopId === dest.id && c.name.trim())
    .forEach((c, i) => {
      const place: Place = {
        id: customPlaceId(dest.id, c.name),
        name: c.name.trim(),
        kind: 'activity',
        interests: [],
        cluster: `custom-${i}`,
        fromBaseHours: 0.5,
        visitHours: 1.5,
        priority: 3,
      }
      if (!excluded.has(place.id)) list.push({ place, score: 13, mustInclude: true, custom: true })
    })
  return { list, closed }
}

/** Stable id for a place the person added, so it can be moved or removed. */
export function customPlaceId(stopId: string, name: string): string {
  return `custom:${stopId}:${normalize(name).replace(/ /g, '-')}`
}

function outingHours(places: Place[]): number {
  if (places.length === 0) return 0
  const travel = 2 * Math.max(...places.map((p) => p.fromBaseHours))
  const visits = places.reduce((sum, p) => sum + p.visitHours, 0)
  return travel + visits + HOP_HOURS * (places.length - 1)
}

function toPlanned(c: Candidate, dest: Destination, enRoute = false): PlannedStop {
  return {
    placeId: c.place.id,
    name: c.place.name,
    cluster: c.place.cluster,
    clusterTitle: dest.clusters[c.place.cluster] ?? c.place.name,
    fromBaseHours: c.place.fromBaseHours,
    visitHours: c.place.visitHours,
    note: c.place.note,
    kind: c.custom ? undefined : c.place.kind,
    custom: c.custom || undefined,
    enRoute: enRoute || undefined,
  }
}

interface DaySlot {
  index: number
  capacity: number
  used: number
  outings: Candidate[][]
}

/**
 * Greedy packing: repeatedly take the most valuable outing (a cluster of
 * nearby places) that still fits in some day, trimming it if needed.
 * Similar places lose value as more of them are picked, so the plan
 * doesn't become three days of viewpoints.
 */
function packPlaces(candidates: Candidate[], slots: DaySlot[]): Candidate[] {
  const remaining = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const group = remaining.get(c.place.cluster) ?? []
    group.push(c)
    remaining.set(c.place.cluster, group)
  }
  const kindCount = new Map<string, number>()
  const value = (c: Candidate) => c.score - 1.25 * Math.max(0, (kindCount.get(c.place.kind) ?? 0) - 1)

  for (;;) {
    let best: { cluster: string; slot: DaySlot; picked: Candidate[]; worth: number } | undefined
    for (const [cluster, group] of remaining) {
      const ordered = [...group].sort((a, b) => value(b) - value(a))
      for (const slot of slots) {
        if (slot.outings.length >= MAX_OUTINGS_PER_DAY) continue
        const placesToday = slot.outings.reduce((n, o) => n + o.length, 0)
        const room = slot.capacity - slot.used
        const picked: Candidate[] = []
        for (const c of ordered) {
          if (placesToday + picked.length >= MAX_PLACES_PER_DAY) break
          if (value(c) <= 0 && !c.mustInclude) continue
          if (outingHours([...picked, c].map((x) => x.place)) <= room) picked.push(c)
        }
        if (picked.length === 0) continue
        // Prefer valuable outings, and among equals the tightest day that fits
        // (best fit), which keeps full days free for long day trips.
        const worth = picked.reduce((s, c) => s + value(c) + (c.mustInclude ? 100 : 0), 0) - room * 0.01
        if (!best || worth > best.worth) best = { cluster, slot, picked, worth }
      }
    }
    if (!best) break
    best.slot.outings.push(best.picked)
    best.slot.used += outingHours(best.picked.map((c) => c.place))
    for (const c of best.picked) kindCount.set(c.place.kind, (kindCount.get(c.place.kind) ?? 0) + 1)
    const left = remaining.get(best.cluster)!.filter((c) => !best!.picked.includes(c))
    if (left.length) remaining.set(best.cluster, left)
    else remaining.delete(best.cluster)
  }
  return [...remaining.values()].flat().sort((a, b) => b.score - a.score)
}

/** Morning places first, evening places last, otherwise keep outing order. */
function orderStops(outings: Candidate[][], dest: Destination): PlannedStop[] {
  const rank = (c: Candidate) => (c.place.timeOfDay === 'morning' ? 0 : c.place.timeOfDay === 'evening' ? 2 : 1)
  const dataOrder = (c: Candidate) => dest.places.findIndex((p) => p.id === c.place.id)
  const outingRank = (o: Candidate[]) => Math.min(...o.map(rank)) + (o.every((c) => rank(c) === 2) ? 1 : 0)
  return [...outings]
    .sort((a, b) => outingRank(a) - outingRank(b))
    .flatMap((o) => [...o].sort((a, b) => rank(a) - rank(b) || dataOrder(a) - dataOrder(b)))
    .map((c) => toPlanned(c, dest))
}

// ─── Text ───────────────────────────────────────────────────────────────────

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function approx(h: number): string {
  if (h < 1) return `${Math.round((h * 60) / 15) * 15 || 15} min`
  const rounded = Math.round(h * 2) / 2
  return `${rounded} h`
}

function travelNotes(stops: PlannedStop[], baseName: string): string[] {
  const byCluster = new Map<string, PlannedStop[]>()
  for (const s of stops) {
    if (s.enRoute) continue
    byCluster.set(s.clusterTitle, [...(byCluster.get(s.clusterTitle) ?? []), s])
  }
  const notes: string[] = []
  for (const [title, group] of byCluster) {
    const far = Math.max(...group.map((s) => s.fromBaseHours))
    if (far >= 0.5 && !group.some((s) => s.custom)) notes.push(`${title}: about ${approx(far)} each way from ${baseName}.`)
  }
  for (const s of stops) if (s.note) notes.push(`${s.name}: ${s.note}`)
  return notes
}

function primaryTitle(stops: PlannedStop[], fallback: string): string {
  const hours = new Map<string, number>()
  for (const s of stops) {
    if (s.enRoute) continue
    hours.set(s.clusterTitle, (hours.get(s.clusterTitle) ?? 0) + s.visitHours + s.fromBaseHours)
  }
  const top = [...hours.entries()].sort((a, b) => b[1] - a[1])[0]
  // "Manali town" style titles say less than the destination name itself.
  if (!top || /\btown\b/i.test(top[0])) return fallback
  return top[0]
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface Skeleton {
  type: DayType
  node?: number
  start: number
  end: number
  cap: number
  /** Hour of arrival that day, for the summary. */
  arriveHour?: number
}

export function planTrip(input: TripInput, resolved: ResolvedTrip): TripPlan {
  const warnings: Notice[] = []
  let extendTo: string | undefined
  const suggestions: string[] = []
  const style: TravelStyle = input.style ?? 'balanced'
  const pref: TransportPref = input.transport ?? 'any'

  if (!isValidDate(input.departDate) || !isValidDate(input.returnDate)) {
    throw new Error('Dates must be valid YYYY-MM-DD values.')
  }
  const totalDays = daysBetween(input.departDate, input.returnDate) + 1
  if (totalDays < 1) throw new Error('The return date is before the departure date.')
  if (resolved.stops.length === 0) throw new Error('Add at least one destination.')

  const month = monthOf(input.departDate)
  const { origin, returnTo } = resolved
  const lastDay = totalDays - 1

  // Outbound timing depends only on the first stop, which never changes when
  // later stops are dropped, so work it out once.
  const draftRoute = buildRoute(origin, returnTo, resolved.stops, month, [])
  const firstNode = draftRoute[0]
  let outEstimate: JourneyEstimate | undefined
  if (firstNode.legIn !== undefined && firstNode.gateway?.via === origin.id) {
    outEstimate = { mode: 'car', hours: firstNode.legIn }
  } else {
    outEstimate = pickPlanningMode(journeyOptions(origin, firstNode.dest), style, pref)
  }
  // Say plainly when the transport the person asked for doesn't work here.
  const prefNote = (est: JourneyEstimate | undefined, from: Coords | undefined, fromName: string, dest: Destination, legName: string) => {
    if (pref === 'any' || est?.mode === pref) return
    const why = firstLegIsRoadOnly(dest, est) ? `${dest.name} is reached by road from ${fromName}` : unavailableReason(from, fromName, dest, pref)
    const instead = est ? ` The ${legName} is planned ${est.mode === 'car' ? 'by road' : `by ${MODE_LABEL[est.mode]}`} instead.` : ''
    warnings.push({ level: 'caution', text: `You asked for ${PREF_NOUN[pref]}, but ${why}.${instead}` })
  }
  prefNote(outEstimate, origin.coords, origin.name, firstNode.dest, 'journey there')
  const givenDepart = parseTime(input.departTime)
  const departHour = givenDepart ?? (outEstimate ? defaultDepartHour(outEstimate) : 7)
  const arrivalAbs = departHour + (outEstimate?.hours ?? 4)
  const arrivalDay = Math.floor(arrivalAbs / 24)
  const arrivalHour = arrivalAbs - arrivalDay * 24
  const longOutbound = (outEstimate?.hours ?? 0) >= LONG_JOURNEY_HOURS
  if (!outEstimate) {
    warnings.push({ level: 'info', text: `We couldn't estimate travel time from ${origin.name} to ${firstNode.dest.name}, so the first day assumes a midday arrival.` })
  }

  // Fit every stop if possible: first with comfortable minimums, then with
  // tight ones. Only then leave out the stop that frees the fewest nights, so
  // a short stopover goes before the main destination does.
  let stops = [...resolved.stops]
  const dropped: string[] = []
  const nightsAvailable = lastDay - arrivalDay
  const need = (r: RouteNode[], tight = false) => {
    const users = r.filter((n) => !n.transit).length
    return r.reduce((s, n) => s + requiredNights(n, users, tight), 0)
  }
  const fullRoute = buildRoute(origin, returnTo, stops, month, warnings)
  let route = fullRoute
  let tight = false
  // Trimming only makes sense while each stop still gets some real time.
  const canTrim = (r: RouteNode[]) => nightsAvailable >= 1.5 * r.filter((n) => !n.transit).length
  if (need(route) > nightsAvailable) {
    tight = true
    while (stops.length > 1 && (need(route, true) > nightsAvailable || !canTrim(route))) {
      const options = stops.map((_, i) => {
        const rest = stops.filter((_, j) => j !== i)
        const r = buildRoute(origin, returnTo, rest, month, [])
        return { i, rest, r, need: need(r, true) }
      })
      // Prefer an option that fits while keeping the most; else shrink the most.
      const fits = options.filter((o) => o.need <= nightsAvailable && canTrim(o.r)).sort((a, b) => b.need - a.need)
      const pick = fits[0] ?? options.sort((a, b) => a.need - b.need)[0]
      dropped.push(stops[pick.i].name)
      stops = pick.rest
      route = pick.r
    }
    if (need(route) <= nightsAvailable) tight = false
  }
  if (dropped.length) {
    const fullNeed = need(fullRoute)
    extendTo = addDays(input.departDate, arrivalDay + fullNeed)
    warnings.unshift({
      level: 'caution',
      text: `Not enough days for every stop, so ${listNames(dropped)} ${dropped.length > 1 ? 'were' : 'was'} left out. To fit everything, head back on ${formatDate(extendTo)} instead (${arrivalDay + fullNeed + 1} days in all).`,
    })
  }

  // Inbound journey from the final stop.
  const lastNode = route.at(-1)!
  let inEstimate: JourneyEstimate | undefined
  if (lastNode.transit === false && lastNode.gateway?.via === returnTo.id) {
    inEstimate = { mode: 'car', hours: lastNode.gateway.roadHours }
  } else {
    // Estimated home → stop, which is symmetric and counts the stop's own
    // airport or railhead.
    const home = findDestinationById(returnTo.id)
    inEstimate = pickPlanningMode(home ? journeyOptions(lastNode.dest, home) : journeyOptions(returnTo, lastNode.dest), style, pref)
  }
  if (lastNode.dest.id !== firstNode.dest.id || returnTo.id !== origin.id) prefNote(inEstimate, returnTo.coords, returnTo.name, lastNode.dest, 'journey back')
  const givenReturn = parseTime(input.returnTime)
  const returnHour = givenReturn ?? (inEstimate ? defaultReturnHour(inEstimate) : 15)

  let feasible = nightsAvailable >= 0 && !(arrivalDay === lastDay && arrivalHour + 1 > returnHour)
  let nights = feasible ? allocateNights(route, nightsAvailable, tight) : route.map(() => 0)
  // Every stop before the last needs a night, or the route can't be driven.
  if (feasible && nights.slice(0, -1).some((n) => n === 0)) {
    feasible = false
    nights = route.map(() => 0)
  }

  // ── Day skeleton ──
  const skeleton: Skeleton[] = Array.from({ length: totalDays }, () => ({ type: 'travel', start: 0, end: 0, cap: 0 }))
  if (feasible) {
    let cursor = arrivalDay
    route.forEach((node, i) => {
      const day = skeleton[cursor]
      if (i === 0) {
        const light = longOutbound || arrivalHour < 6
        Object.assign(day, {
          type: 'arrival',
          node: i,
          start: Math.max(arrivalHour + 1, DAY_START),
          end: DAY_END,
          cap: light ? LIGHT_DAY_HOURS : FULL_DAY_HOURS,
          arriveHour: arrivalHour,
        })
      } else {
        const enRouteHours = node.enRoute.reduce((s, id) => s + (node.dest.places.find((p) => p.id === id)?.visitHours ?? 0), 0)
        const arrive = TRANSFER_START + (node.legIn ?? 0) + enRouteHours
        Object.assign(day, {
          type: 'transfer',
          node: i,
          start: arrive + 0.5,
          end: DAY_END,
          cap: (node.legIn ?? 0) >= 5 ? 2 : 5,
          arriveHour: arrive,
        })
      }
      if ((node.dest.altitudeM ?? 0) >= HIGH_ALTITUDE_M) {
        day.cap = Math.min(day.cap, 1.5)
        if (nights[i] >= 2) skeleton[cursor + 1].cap = 5
      }
      for (let d = cursor + 1; d < cursor + nights[i]; d++) {
        Object.assign(skeleton[d], { type: 'explore', node: i, start: DAY_START, end: DAY_END, cap: skeleton[d].cap || FULL_DAY_HOURS })
      }
      cursor += nights[i]
    })
    // The last day: leave the final stop for home.
    const ret = skeleton[lastDay]
    const sameDay = ret.type === 'arrival' || ret.type === 'transfer'
    Object.assign(ret, {
      type: 'return',
      node: route.length - 1,
      start: sameDay ? ret.start : DAY_START,
      end: returnHour - 1,
      cap: sameDay ? ret.cap : FULL_DAY_HOURS,
    })
  }

  // ── Fill places per stop ──
  const dayPlans: DayPlan[] = skeleton.map((s, d) => ({
    day: d + 1,
    date: addDays(input.departDate, d),
    type: s.type,
    title: '',
    stopId: s.node !== undefined ? route[s.node].dest.id : undefined,
    capacityHours: Math.max(0, Math.round(Math.min(s.cap, s.end - s.start) * 2) / 2),
    stops: [],
    optional: [],
    summary: '',
    notes: [],
  }))
  const leftovers: Record<string, PlannedStop[]> = {}
  const candidatesByStop: Record<string, Place[]> = {}
  // A destination can appear twice (Manali on the way to and from Spiti).
  const alreadyPlanned = new Set<string>()

  route.forEach((node, i) => {
    const dest = node.dest
    const dayIdx = skeleton.map((s, d) => (s.node === i ? d : -1)).filter((d) => d >= 0)
    if (dayIdx.length === 0) return
    const stopMonth = monthOf(dayPlans[dayIdx[0]].date)
    const { list, closed } = candidatesFor(dest, input, stopMonth)
    candidatesByStop[dest.id] = dest.places

    // En-route places are visited on the transfer day itself.
    const transferDay = dayIdx.find((d) => skeleton[d].type === 'transfer')
    const enRoute = list.filter((c) => node.enRoute.includes(c.place.id))
    if (transferDay !== undefined && enRoute.length) {
      dayPlans[transferDay].stops.push(...enRoute.map((c) => toPlanned(c, dest, true)))
    }
    const pool = list.filter((c) => !enRoute.includes(c) && !alreadyPlanned.has(c.place.id))

    const slots: DaySlot[] = dayIdx.map((d) => ({ index: d, capacity: dayPlans[d].capacityHours, used: 0, outings: [] }))
    const left = packPlaces(pool, slots)
    for (const slot of slots) {
      dayPlans[slot.index].stops.push(...orderStops(slot.outings, dest))
      for (const o of slot.outings) for (const c of o) alreadyPlanned.add(c.place.id)
    }
    for (const c of enRoute) alreadyPlanned.add(c.place.id)
    // Offer what's left on days with spare room, as optional.
    for (const slot of slots) {
      const room = slot.capacity - slot.used
      if (room < 1.5) continue
      const extra = left.filter((c) => !c.mustInclude && outingHours([c.place]) <= room && !dayPlans.some((p) => p.optional.some((o) => o.placeId === c.place.id)))
      dayPlans[slot.index].optional.push(...extra.slice(0, 2).map((c) => toPlanned(c, dest)))
    }
    const optionalIds = new Set(dayPlans.flatMap((p) => p.optional.map((o) => o.placeId)))
    leftovers[dest.id] = left.filter((c) => !optionalIds.has(c.place.id)).map((c) => toPlanned(c, dest))
    if (left.some((c) => c.mustInclude)) {
      warnings.push({ level: 'caution', text: `Couldn't fit ${listNames(left.filter((c) => c.mustInclude).map((c) => c.place.name))} in ${dest.name} without rushing.` })
    }
    const notableClosed = closed.filter((p) => p.priority === 3)
    if (notableClosed.length && !node.transit) {
      warnings.push({ level: 'info', text: `${listNames(notableClosed.map((p) => p.name))} ${notableClosed.length > 1 ? 'are' : 'is'} usually closed in ${monthName(stopMonth)}, so ${notableClosed.length > 1 ? "they're" : "it's"} left out.` })
    }
  })

  // ── Places the person moved to another day of the same stop ──
  for (const [placeId, dayNo] of Object.entries(input.moves ?? {})) {
    const target = dayPlans[dayNo - 1]
    const from = dayPlans.find((p) => p.stops.some((x) => x.placeId === placeId && !x.enRoute) || p.optional.some((x) => x.placeId === placeId))
    if (!target || !from || from === target || target.stopId !== from.stopId || target.type === 'travel') continue
    const inStops = from.stops.find((x) => x.placeId === placeId)
    const place = inStops ?? from.optional.find((x) => x.placeId === placeId)!
    if (inStops) from.stops = from.stops.filter((x) => x !== place)
    else from.optional = from.optional.filter((x) => x !== place)
    target.stops.push(place)
    target.optional = target.optional.filter((x) => x.placeId !== placeId)
  }

  // ── Titles, summaries and notes ──
  const name = (i?: number) => (i === undefined ? '' : route[i].dest.name)
  dayPlans.forEach((p, d) => {
    const s = skeleton[d]
    const placeNames = p.stops.map((x) => x.name)
    const visit = placeNames.length ? `Visit ${listNames(placeNames)}.` : ''
    const base = name(s.node)
    const baseTown = s.node === undefined ? '' : (route[s.node].dest.baseName ?? base)
    switch (s.type) {
      case 'travel': {
        const target = firstNode.dest.name
        if (d === 0) {
          p.title = `Depart ${origin.name}`
          p.summary = outEstimate
            ? `Leave ${origin.name} around ${formatHour(departHour)} by ${MODE_LABEL[outEstimate.mode]} for ${target} (about ${approx(outEstimate.hours)} door to door).`
            : `Leave ${origin.name} for ${target}.`
        } else {
          p.title = `On the way to ${target}`
          p.summary = `Travel day. Rest on the way; you reach ${target} around ${formatHour(arrivalHour)} on day ${arrivalDay + 1}.`
        }
        break
      }
      case 'arrival': {
        p.title = `Arrive in ${base}`
        const after = longOutbound ? ' after the long journey' : ''
        const rest = p.capacityHours <= 2 ? ', check in and rest' : ', check in'
        p.summary = `Arrive around ${formatHour(s.arriveHour ?? DAY_START)}${after}${rest}.${visit ? ` ${visit}` : ''}`
        break
      }
      case 'transfer': {
        const from = name((s.node ?? 1) - 1)
        p.title = `${from} → ${base}`
        const prev = route[s.node! - 1].dest
        const here = route[s.node!].dest
        p.transfer = {
          from,
          to: base,
          hours: route[s.node!].legIn ?? 0,
          links: [...(isIndia(here) ? [busLink(prev.name, here.name)] : []), mapsLink(prev, here)],
        }
        const via = p.stops.filter((x) => x.enRoute).map((x) => x.name)
        const others = p.stops.filter((x) => !x.enRoute).map((x) => x.name)
        p.summary = `Drive about ${approx(route[s.node!].legIn ?? 0)} to ${base}${via.length ? `, stopping at ${listNames(via)}` : ''}.${others.length ? ` Then ${listNames(others)}.` : ' Check in and rest.'}`
        break
      }
      case 'explore': {
        if (p.stops.length === 0) {
          p.type = 'free'
          p.title = `Slow day in ${base}`
          p.summary = `Keep this day free: rest, cafés or a local walk. It's also a buffer for weather or road delays.`
        } else {
          p.title = primaryTitle(p.stops, base)
          p.summary = visit
        }
        break
      }
      case 'return': {
        const home = returnTo.name
        p.title = `Return to ${home}`
        const leave = inEstimate
          ? `Leave ${base} around ${formatHour(returnHour)} by ${MODE_LABEL[inEstimate.mode]} (about ${approx(inEstimate.hours)} to ${home}).`
          : `Head back to ${home}.`
        p.summary = placeNames.length ? `${visit} ${leave}` : `Check out. ${leave}`
        break
      }
    }
    if (s.node !== undefined) p.notes.push(...travelNotes(p.stops, baseTown))
    if (s.type === 'arrival' || s.type === 'transfer') {
      const dest = route[s.node!].dest
      if ((dest.altitudeM ?? 0) >= HIGH_ALTITUDE_M) {
        p.notes.unshift(`${dest.name} is at about ${dest.altitudeM!.toLocaleString('en-IN')} m. Take it easy today to acclimatise.`)
      }
    }
  })

  // ── Inbound arrival back home ──
  const inboundArrivalAbs = returnHour + (inEstimate?.hours ?? 0)
  const inbound: JourneyLeg = {
    from: lastNode.dest.name,
    to: returnTo.name,
    estimate: inEstimate,
    departHour: returnHour,
    timeAssumed: givenReturn === undefined,
    arrival: inEstimate
      ? { date: addDays(input.returnDate, Math.floor(inboundArrivalAbs / 24)), hour: inboundArrivalAbs % 24 }
      : undefined,
  }
  const outbound: JourneyLeg = {
    from: origin.name,
    to: firstNode.dest.name,
    estimate: outEstimate,
    departHour,
    timeAssumed: givenDepart === undefined,
    arrival: outEstimate ? { date: addDays(input.departDate, arrivalDay), hour: arrivalHour } : undefined,
  }

  // ── Transport options and a rough budget ──
  const travellers = Math.max(1, input.travellers ?? 2)
  outbound.options = legOptions({ home: origin, dest: firstNode.dest, chosen: outEstimate, outbound: true, date: input.departDate, style, travellers })
  inbound.options = legOptions({ home: returnTo, dest: lastNode.dest, chosen: inEstimate, outbound: false, date: input.returnDate, style, travellers })
  if (pref !== 'any') {
    for (const o of [...outbound.options, ...inbound.options]) if (o.recommended && o.mode === pref) o.why = 'Your preferred transport.'
  }
  const budget = feasible
    ? estimateBudget({
        style,
        travellers,
        nights: nights.reduce((a, b) => a + b, 0),
        foodDays: dayPlans.reduce((sum, p) => sum + FOOD_DAY_SHARE[p.type], 0),
        outings: dayPlans
          .map((p) => p.stops.filter((x) => !x.enRoute))
          .filter((ps) => ps.length > 0)
          .map((ps) => ({ farthestHours: Math.max(...ps.map((x) => x.fromBaseHours)), kinds: ps.flatMap((x) => (x.kind ? [x.kind] : [])) })),
        transferHours: route.slice(1).reduce((h, n) => h + (n.legIn ?? 0), 0),
        outbound: outbound.options.find((o) => o.recommended),
        inbound: inbound.options.find((o) => o.recommended),
      })
    : undefined

  // ── Feasibility, season and suggestions ──
  const userNodes = route.map((n, i) => ({ n, i })).filter((x) => !x.n.transit)
  if (!feasible) {
    warnings.unshift({
      level: 'avoid',
      text: nightsAvailable >= 0 && route.length > 1
        ? `This route needs at least ${need(route)} nights after travel, but these dates leave ${Math.max(nightsAvailable, 0)}.`
        : `Getting to ${firstNode.dest.name} takes about ${approx(outEstimate?.hours ?? 0)}, which leaves no time there with these dates.`,
    })
  } else {
    for (const { n, i } of userNodes) {
      if (nights[i] < n.dest.minNights) {
        warnings.push({ level: 'caution', text: `${n.dest.name} usually needs at least ${n.dest.minNights} night${n.dest.minNights > 1 ? 's' : ''} there; this plan has ${nights[i]}. Add days for a less rushed trip.` })
      }
    }
  }
  const shortOnTime = !feasible || userNodes.some(({ n, i }) => nights[i] < n.dest.minNights)
  if (shortOnTime) {
    const alt = resolved.stops[0].alternatives
      ?.map((id) => getDestination(id))
      .filter((a) => !route.some((n) => n.dest.id === a.id))
      .filter((a) => {
        const est = pickPlanningMode(journeyOptions(origin, a), style, pref)
        if (!est) return false
        const hoursAvailable = totalDays * 24 - departHour - 6
        return 2 * est.hours + Math.max(a.minNights, 1) * 24 <= hoursAvailable
      })
      .slice(0, 2)
    const needDays = Math.ceil(((outEstimate?.hours ?? 0) + (inEstimate?.hours ?? 0)) / 24 + need(route)) + 1
    if (needDays > totalDays) suggestions.push(`From ${origin.name}, this route needs about ${needDays} days in total.`)
    if (alt?.length) suggestions.push(`With ${totalDays} day${totalDays > 1 ? 's' : ''}, ${listNames(alt.map((a) => a.name))} would be a more relaxed choice from ${origin.name}.`)
  }

  const seen = new Set<string>()
  for (const { n } of route.map((n) => ({ n }))) {
    if (seen.has(n.dest.id) || n.dest.source === 'placeholder') continue
    seen.add(n.dest.id)
    const notes = (n.dest.seasonNotes ?? []).filter((s) => s.months.includes(month))
    for (const s of notes) warnings.push({ level: s.level, text: s.text })
    if (!n.transit && notes.length === 0 && n.dest.bestMonths.length && !n.dest.bestMonths.includes(month)) {
      warnings.push({ level: 'info', text: `${n.dest.name} is usually best in ${formatMonths(n.dest.bestMonths)}.` })
    }
  }

  // Spare days: suggest a nearby add-on.
  for (const { n, i } of userNodes) {
    const free = dayPlans.filter((p) => p.type === 'free' && skeleton[p.day - 1].node === i).length
    if (free < 2) continue
    const near = n.dest.links
      ?.filter((l) => l.roadHours <= 4 && !route.some((r) => r.dest.id === l.to))
      .sort((a, b) => a.roadHours - b.roadHours)[0]
    if (near) suggestions.push(`You have spare time in ${n.dest.name}: ${getDestination(near.to).name} is about ${approx(near.roadHours)} away and could take ${free > 2 ? '2 nights' : 'a night'}.`)
  }

  const userStopNames = route.filter((n) => !n.transit).map((n) => n.dest.name)
  const titleParts = [origin.name, ...userStopNames]
  if (userStopNames.length > 1 || returnTo.id !== origin.id) titleParts.push(returnTo.name)

  return {
    input,
    title: titleParts.join(' → ').toUpperCase(),
    route: route.map((n, i) => ({ id: n.dest.id, name: n.dest.name, nights: nights[i], transit: n.transit }) satisfies RouteStop),
    droppedStops: dropped,
    extendTo,
    budget,
    startDate: input.departDate,
    endDate: input.returnDate,
    totalDays,
    outbound,
    inbound,
    days: dayPlans,
    leftovers,
    candidates: candidatesByStop,
    warnings: dedupe(warnings),
    suggestions,
  }
}

function dedupe(notices: Notice[]): Notice[] {
  const seen = new Set<string>()
  return notices.filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true)))
}
