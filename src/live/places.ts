import type { AccessInfo, Coords, Interest, Place, PlaceKind } from '../data/types'
import { roadKm, straightKm } from '../engine/geo'
import { fetchJson } from './http'

// Nearby attractions from OpenStreetMap through the public Overpass API
// (free, no key, CORS enabled). https://wiki.openstreetmap.org/wiki/Overpass_API
// Notability is judged from the tags: places with a Wikipedia or Wikidata
// link are usually the ones worth a visit.

const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Search radius for day-trip-able places around the stay base. */
export const PLACES_RADIUS_KM = 45

export function placesQuery(c: Coords, radiusKm = PLACES_RADIUS_KM): string {
  const r = Math.round(radiusKm * 1000)
  const near = `(around:${r},${c.lat},${c.lon})`
  // Wide net for the clearly touristic tags, notable-only for the rest.
  return `[out:json][timeout:25];
(
  nwr${near}["tourism"~"^(attraction|viewpoint|museum|zoo|theme_park|gallery)$"]["name"];
  nwr${near}["historic"~"^(fort|castle|palace|monument|ruins|archaeological_site|monastery|city_gate)$"]["name"];
  nwr${near}["natural"~"^(waterfall|beach|cave_entrance|bay)$"]["name"];
  nwr${near}["waterway"="waterfall"]["name"];
  nwr${near}["natural"~"^(peak|volcano|glacier)$"]["name"]["wikidata"];
  nwr${near}["natural"="water"]["name"]["wikidata"];
  nwr${near}["amenity"="place_of_worship"]["name"]["wikidata"];
  nwr${near}["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikidata"];
  nwr${near}["boundary"~"^(national_park|protected_area)$"]["name"]["wikidata"];
  nwr${near}["mountain_pass"="yes"]["name"]["wikidata"];
);
out center tags 300;`
}

export function airportQuery(c: Coords): string {
  return `[out:json][timeout:25];
nwr(around:250000,${c.lat},${c.lon})["aeroway"="aerodrome"]["iata"];
out center tags 40;`
}

/** Passenger stations within reach by road. Small towns are often tagged without a Wikidata link, so none is required. */
export function stationQuery(c: Coords): string {
  return `[out:json][timeout:25];
nwr(around:${STATION_RADIUS_KM * 1000},${c.lat},${c.lon})["railway"="station"]["name"]["station"!~"^(subway|light_rail|monorail|tram|funicular)$"]["usage"!="tourism"];
out center tags 80;`
}

/** Furthest station we'll call a railhead, straight-line. */
export const STATION_RADIUS_KM = 100

async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown
  for (const url of OVERPASS_URLS) {
    try {
      const data = await fetchJson<{ elements: OsmElement[] }>(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, 30_000)
      return data.elements ?? []
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

function coordsOf(e: OsmElement): Coords | undefined {
  if (e.lat !== undefined && e.lon !== undefined) return { lat: e.lat, lon: e.lon }
  if (e.center) return { lat: e.center.lat, lon: e.center.lon }
  return undefined
}

interface KindInfo {
  kind: PlaceKind
  interests: Interest[]
  visitHours: number
  timeOfDay?: 'morning' | 'evening'
}

function classify(t: Record<string, string>): KindInfo | undefined {
  const religion = t.religion
  if (t.historic === 'fort' || t.historic === 'castle' || t.castle_type === 'fortress') return { kind: 'fort', interests: ['sightseeing', 'trekking'], visitHours: 2 }
  if (t.historic === 'palace' || t.castle_type === 'palace') return { kind: 'palace', interests: ['sightseeing'], visitHours: 1.5 }
  if (t.natural === 'waterfall' || t.waterway === 'waterfall') return { kind: 'waterfall', interests: ['nature'], visitHours: 1 }
  if (t.natural === 'beach' || t.natural === 'bay') return { kind: 'beach', interests: ['beaches', 'relaxation'], visitHours: 2, timeOfDay: 'evening' }
  if (t.natural === 'cave_entrance' || /caves?\b/i.test(t.name ?? '')) return { kind: 'caves', interests: ['sightseeing', 'nature'], visitHours: 1.5 }
  if (t.natural === 'peak' || t.natural === 'volcano') return { kind: 'trek', interests: ['trekking', 'mountains', 'adventure'], visitHours: 4, timeOfDay: 'morning' }
  if (t.natural === 'glacier') return { kind: 'viewpoint', interests: ['mountains', 'nature'], visitHours: 2 }
  if (t.mountain_pass === 'yes') return { kind: 'pass', interests: ['mountains', 'adventure'], visitHours: 1.5 }
  if (t.natural === 'water') return { kind: 'lake', interests: ['nature', 'relaxation'], visitHours: 1 }
  if (t.boundary === 'national_park' || t.boundary === 'protected_area' || t.leisure === 'nature_reserve') return { kind: 'wildlife', interests: ['nature', 'adventure'], visitHours: 3, timeOfDay: 'morning' }
  if (t.leisure === 'park' || t.leisure === 'garden') return { kind: 'garden', interests: ['nature', 'relaxation'], visitHours: 1 }
  if (t.amenity === 'place_of_worship' || t.historic === 'monastery') {
    if (religion === 'buddhist') return { kind: 'monastery', interests: ['sightseeing'], visitHours: 1 }
    if (religion === 'christian') return { kind: 'church', interests: ['sightseeing'], visitHours: 0.75 }
    return { kind: 'temple', interests: ['sightseeing'], visitHours: 1 }
  }
  if (t.tourism === 'viewpoint') return { kind: 'viewpoint', interests: ['nature', 'sightseeing'], visitHours: 0.75, timeOfDay: 'evening' }
  if (t.tourism === 'museum' || t.tourism === 'gallery') return { kind: 'museum', interests: ['sightseeing'], visitHours: 1.5 }
  if (t.tourism === 'zoo') return { kind: 'wildlife', interests: ['nature'], visitHours: 2 }
  if (t.tourism === 'theme_park') return { kind: 'activity', interests: ['adventure'], visitHours: 4 }
  if (t.historic) return { kind: 'heritage', interests: ['sightseeing'], visitHours: 1 }
  if (t.tourism === 'attraction') return { kind: 'heritage', interests: ['sightseeing'], visitHours: 1 }
  return undefined
}

function notability(t: Record<string, string>): number {
  let n = 0
  if (t.wikipedia) n += 2
  if (t.wikidata) n += 1
  if (t.tourism === 'attraction') n += 0.5
  if (t.image || t.wikimedia_commons) n += 0.5
  if (t.heritage) n += 0.5
  return n
}

/** Rough in-region road speed for short hops, km/h. */
const LOCAL_KMPH = 30
const CLUSTER_KM = 3

export interface LivePlaces {
  places: Place[]
  clusters: Record<string, string>
}

export function parsePlaces(elements: OsmElement[], base: Coords, maxPlaces = 30): LivePlaces {
  const byName = new Map<string, { place: Place; coords: Coords; score: number }>()
  for (const e of elements) {
    const t = e.tags ?? {}
    const name = t['name:en'] || t.name
    const c = coordsOf(e)
    if (!name || !c) continue
    const info = classify(t)
    if (!info) continue
    const km = straightKm(base, c)
    const notable = notability(t)
    // Farther places must be more notable to be worth the drive.
    const score = notable - km / 15
    const priority: Place['priority'] = notable >= 3 ? 3 : notable >= 1.5 ? 2 : 1
    const fromBaseHours = Math.max(0.1, Math.round(((roadKm(base, c) / LOCAL_KMPH) * 4)) / 4)
    const place: Place = {
      id: `osm:${e.type}/${e.id}`,
      name,
      kind: info.kind,
      interests: info.interests,
      cluster: '',
      fromBaseHours,
      visitHours: info.visitHours,
      priority,
      timeOfDay: info.timeOfDay,
    }
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (!existing || existing.score < score) byName.set(key, { place, coords: c, score })
  }
  const ranked = [...byName.values()].sort((a, b) => b.score - a.score).slice(0, maxPlaces)

  // Group places within a few km of each other into one outing, seeded by
  // the most notable place, which also names the group.
  const clusters: Record<string, string> = {}
  const assigned = new Set<string>()
  for (const seed of ranked) {
    if (assigned.has(seed.place.id)) continue
    const id = `c${Object.keys(clusters).length + 1}`
    const members = ranked.filter((r) => !assigned.has(r.place.id) && straightKm(seed.coords, r.coords) <= CLUSTER_KM)
    for (const m of members) {
      m.place.cluster = id
      assigned.add(m.place.id)
    }
    clusters[id] = members.length > 1 ? `${seed.place.name} & around` : seed.place.name
  }
  return { places: ranked.map((r) => r.place), clusters }
}

export function parseAccess(elements: OsmElement[], base: Coords): AccessInfo {
  const withCoords = elements
    .map((e) => ({ e, c: coordsOf(e) }))
    .filter((x): x is { e: OsmElement; c: Coords } => !!x.c)
    .map((x) => ({ ...x, km: roadKm(base, x.c) }))
    .sort((a, b) => a.km - b.km)
  const airport = withCoords.find((x) => x.e.tags?.aeroway === 'aerodrome')
  // Nearest station, unless a notable one (Wikidata-listed: a junction or major stop, with more trains)
  // is only a little further.
  const stations = withCoords.filter((x) => x.e.tags?.railway === 'station')
  const nearest = stations[0]
  const notable = stations.find((x) => x.e.tags?.wikidata)
  const station = nearest && notable && notable.km - nearest.km <= 25 ? notable : nearest
  const hours = (km: number) => Math.max(0.25, Math.round((km / 40) * 2) / 2)
  return {
    airport: airport
      ? { name: airport.e.tags?.['name:en'] || airport.e.tags?.name || airport.e.tags!.iata, code: airport.e.tags!.iata, roadHours: hours(airport.km) }
      : undefined,
    railhead: station ? { name: station.e.tags?.['name:en'] || station.e.tags!.name, roadHours: hours(station.km) } : undefined,
    // Small regional airports usually need a connection from far away.
    connectingFlightLikely: airport ? !/international/i.test(airport.e.tags?.name ?? '') : undefined,
  }
}

export async function fetchNearbyPlaces(base: Coords): Promise<LivePlaces> {
  return parsePlaces(await overpass(placesQuery(base)), base)
}

/** Airports and stations are looked up separately, so one slow query doesn't lose the other. */
export async function fetchAccess(base: Coords): Promise<AccessInfo> {
  const [airports, stations] = await Promise.allSettled([overpass(airportQuery(base)), overpass(stationQuery(base))])
  if (airports.status === 'rejected' && stations.status === 'rejected') throw airports.reason
  const access = parseAccess([...(airports.status === 'fulfilled' ? airports.value : []), ...(stations.status === 'fulfilled' ? stations.value : [])], base)
  return airports.status === 'rejected' || stations.status === 'rejected' ? { ...access, lookupFailed: true } : access
}
