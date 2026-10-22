import type { Destination } from '../data/types'
import { findDestination, findOrigin, titleCase } from './geo'
import type { ResolvedTrip, TripInput } from './types'

/** A stop we know nothing about yet: the person adds their own places. */
export function placeholderDestination(name: string): Destination {
  const clean = titleCase(name.trim())
  return {
    id: `custom:${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: clean,
    source: 'placeholder',
    region: '',
    coords: { lat: 0, lon: 0 },
    minNights: 1,
    idealNights: 2,
    bestMonths: [],
    access: {},
    clusters: {},
    places: [],
  }
}

/** Looks everything up in the curated dataset only (no network). */
export function resolveCurated(input: TripInput): ResolvedTrip & { unknownStops: string[] } {
  const origin = findOrigin(input.from)
  const returnTo = input.returnTo ? findOrigin(input.returnTo) : origin
  const unknownStops: string[] = []
  const stops = input.stops.map((s) => {
    const d = findDestination(s)
    if (d) return d
    unknownStops.push(s)
    return placeholderDestination(s)
  })
  return { origin, returnTo, stops, unknownStops }
}
