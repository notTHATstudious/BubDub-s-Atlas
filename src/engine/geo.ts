import { CITIES } from '../data/cities'
import { DESTINATIONS } from '../data/destinations'
import type { City, Coords, Destination } from '../data/types'

const EARTH_RADIUS_KM = 6371

export function straightKm(a: Coords, b: Coords): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Roads in India wind around; 1.3× straight-line distance is a fair rough figure. */
export function roadKm(a: Coords, b: Coords): number {
  return straightKm(a, b) * 1.3
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matches(query: string, name: string, aliases: string[] = []): boolean {
  const q = normalize(query)
  return [name, ...aliases].some((n) => normalize(n) === q)
}

export function findDestination(query: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.id === query || matches(query, d.name, d.aliases))
}

export function findDestinationById(id: string): Destination | undefined {
  return DESTINATIONS.find((x) => x.id === id)
}

export function getDestination(id: string): Destination {
  const d = DESTINATIONS.find((x) => x.id === id)
  if (!d) throw new Error(`Unknown destination id: ${id}`)
  return d
}

/** A starting point: a known city, a known destination, or just a name. */
export interface Origin {
  id: string
  name: string
  coords?: Coords
  /** IATA code of the nearest useful airport, for flight search links. */
  airport?: string
}

export function findOrigin(query: string): Origin {
  const city: City | undefined = CITIES.find((c) => c.id === query || matches(query, c.name, c.aliases))
  if (city) return { id: city.id, name: city.name, coords: city.coords, airport: city.airport }
  const dest = findDestination(query)
  if (dest) return { id: dest.id, name: dest.name, coords: dest.coords, airport: dest.access.airport?.code }
  const name = query.trim()
  return { id: `custom:${normalize(name)}`, name: titleCase(name) }
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Names offered as suggestions in the form. */
export function knownPlaceNames(): { origins: string[]; destinations: string[] } {
  const destinations = DESTINATIONS.map((d) => d.name)
  const origins = [...CITIES.map((c) => c.name), ...destinations]
  return { origins: [...new Set(origins)].sort(), destinations: destinations.sort() }
}
