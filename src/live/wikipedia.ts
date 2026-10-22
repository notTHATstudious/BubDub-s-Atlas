import type { Coords, Place } from '../data/types'
import { roadKm } from '../engine/geo'
import { fetchJson } from './http'

// Wikipedia's "articles near a point" search: a fallback when OpenStreetMap
// has little for a place. Free, no key; origin=* enables CORS.

interface GeoSearchHit {
  pageid: number
  title: string
  lat: number
  lon: number
  dist: number
}

// Titles that are clearly not things to visit.
const SKIP = /\b(district|tehsil|taluka|constituency|railway station|airport|school|college|university|hospital|police|bank|road|highway|village panchayat|block)\b/i

export function parseGeoSearch(hits: GeoSearchHit[], base: Coords, existingNames: Set<string>): Place[] {
  return hits
    .filter((h) => !SKIP.test(h.title) && !existingNames.has(h.title.toLowerCase()))
    .slice(0, 12)
    .map((h, i) => ({
      id: `wiki:${h.pageid}`,
      name: h.title.replace(/\s*\(.*?\)\s*$/, ''),
      kind: 'heritage' as const,
      interests: ['sightseeing' as const],
      cluster: `w${i + 1}`,
      fromBaseHours: Math.max(0.1, Math.round((roadKm(base, h) / 30) * 4) / 4),
      visitHours: 1,
      priority: 1 as const,
    }))
}

export async function fetchWikipediaNearby(base: Coords, existingNames: Set<string>): Promise<Place[]> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&origin=*' +
    `&gscoord=${base.lat}|${base.lon}&gsradius=10000&gslimit=40`
  const data = await fetchJson<{ query?: { geosearch?: GeoSearchHit[] } }>(url)
  return parseGeoSearch(data.query?.geosearch ?? [], base, existingNames)
}
