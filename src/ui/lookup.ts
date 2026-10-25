import { knownPlaceNames, placeholderDestination, type TripInput } from '../engine'
import { resolveTrip, type GeoResult, type LiveResolved } from '../live'
import { recallDestination, recallOrigin, rememberPlaces } from './store'

// Finds every place in a trip, or explains plainly why it can't. A plan built
// on a place we couldn't look up would be made-up filler, so we refuse instead.

/** A problem the person can act on; shown as is, without "something went wrong". */
export class PlanError extends Error {}

const OFFLINE_NOTICE = "Planned offline from hand-checked and remembered places. Search links and new place lookups need the internet."

function curatedExamples(): string {
  const names = knownPlaceNames().destinations
  return `${names.slice(0, 6).join(', ')} and ${names.length - 6} more`
}

/** Without a connection: hand-checked destinations, plus places looked up before on this phone. */
export function resolveOffline(input: TripInput): LiveResolved {
  const origin = recallOrigin(input.from)
  const returnTo = input.returnTo ? recallOrigin(input.returnTo) : origin
  const unknownStops: string[] = []
  const stops = input.stops.map((s) => {
    const d = recallDestination(s)
    if (d) return d
    unknownStops.push(s)
    return placeholderDestination(s)
  })
  const r = { origin, returnTo, stops, unknownStops }
  if (r.unknownStops.length) {
    const list = r.unknownStops.map((s) => `"${s}"`).join(' and ')
    throw new PlanError(
      `You're offline, so ${list} can't be looked up. Connect to the internet to plan ${r.unknownStops.length > 1 ? 'them' : 'it'}, or pick a place that works offline: a hand-checked one like ${curatedExamples()}, or one you've planned before on this phone.`,
    )
  }
  if (!r.origin.coords) {
    throw new PlanError(`You're offline, so we can't find "${input.from}" on the map. Connect to the internet, or start from a major city such as Mumbai, Pune, Delhi or Bengaluru.`)
  }
  return { origin: r.origin, returnTo: r.returnTo, stops: r.stops, notices: [{ level: 'info', text: OFFLINE_NOTICE }] }
}

/** Refuses a lookup that left a stop or the start without real map data. */
export function checkResolved(input: TripInput, r: LiveResolved): LiveResolved {
  const missing = r.stops.filter((s) => s.source === 'placeholder')
  if (missing.length) {
    const reasons = r.notices.filter((n) => missing.some((m) => n.text.toLowerCase().includes(`"${m.name.toLowerCase()}"`)))
    throw new PlanError(reasons.length ? reasons.map((n) => n.text).join(' ') : `We couldn't look up ${missing.map((m) => `"${m.name}"`).join(' and ')}. Check the spelling and try again.`)
  }
  if (!r.origin.coords) {
    throw new PlanError(`We couldn't find "${input.from}" on the map. Check the spelling, or pick it from the suggestions as you type.`)
  }
  return r
}

export async function lookUpTrip(input: TripInput, picked: Record<string, GeoResult>, online: boolean): Promise<LiveResolved> {
  if (!online) return resolveOffline(input)
  const r = checkResolved(input, await resolveTrip(input, picked))
  rememberPlaces(input, r)
  return r
}
