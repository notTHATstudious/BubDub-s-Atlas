import type { Coords } from '../data/types'
import { fetchJson } from './http'

// Photon (by Komoot) is a free geocoder built on OpenStreetMap data, with
// CORS enabled and no API key. https://photon.komoot.io

export interface GeoResult {
  name: string
  /** "Kullu, Himachal Pradesh, India" style context line. */
  label: string
  coords: Coords
  /** OSM place type: city, town, village, hamlet, locality… */
  kind: string
  countryCode?: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    country?: string
    countrycode?: string
    state?: string
    county?: string
    city?: string
    district?: string
    osm_key?: string
    osm_value?: string
    type?: string
  }
}

const PLACE_RANK: Record<string, number> = { city: 0, town: 1, village: 2, state: 3, county: 3, district: 3, hamlet: 4, locality: 4, island: 2 }

export async function geocode(query: string, limit = 5): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit * 2}&lang=en`
  const data = await fetchJson<{ features: PhotonFeature[] }>(url)
  return parsePhoton(data.features).slice(0, limit)
}

export function parsePhoton(features: PhotonFeature[]): GeoResult[] {
  const seen = new Set<string>()
  return features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties
      const kind = p.osm_key === 'place' || p.osm_key === 'boundary' ? (p.osm_value ?? p.type ?? '') : (p.type ?? p.osm_value ?? '')
      const context = [p.county ?? p.district ?? p.city, p.state, p.country].filter((x) => x && x !== p.name)
      return {
        name: p.name!,
        label: [...new Set(context)].join(', '),
        coords: { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] },
        kind,
        countryCode: p.countrycode,
      }
    })
    .filter((r) => {
      const k = `${r.name}|${r.label}`
      return seen.has(k) ? false : (seen.add(k), true)
    })
    // Settlements first; a "Manali" bus stop shouldn't beat Manali town.
    .sort((a, b) => (PLACE_RANK[a.kind] ?? 5) - (PLACE_RANK[b.kind] ?? 5))
}
