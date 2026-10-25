// Shared types for the curated travel dataset.
// All hours and distances in the dataset are rough planning estimates,
// not verified schedules. The UI must label them as approximate.

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type Interest =
  | 'nature'
  | 'mountains'
  | 'trekking'
  | 'cafes'
  | 'adventure'
  | 'sightseeing'
  | 'beaches'
  | 'shopping'
  | 'relaxation'

export const INTERESTS: Interest[] = [
  'nature',
  'mountains',
  'trekking',
  'cafes',
  'adventure',
  'sightseeing',
  'beaches',
  'shopping',
  'relaxation',
]

export type PlaceKind =
  | 'viewpoint'
  | 'fort'
  | 'caves'
  | 'lake'
  | 'waterfall'
  | 'village'
  | 'monastery'
  | 'temple'
  | 'church'
  | 'valley'
  | 'pass'
  | 'market'
  | 'cafes'
  | 'beach'
  | 'trek'
  | 'activity'
  | 'palace'
  | 'museum'
  | 'garden'
  | 'heritage'
  | 'wildlife'

export interface Coords {
  lat: number
  lon: number
}

/** A city people can start from (also used to resolve free-text input). */
export interface City {
  id: string
  name: string
  aliases?: string[]
  state: string
  coords: Coords
  /** IATA code of the city's main airport. */
  airport?: string
}

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  interests: Interest[]
  /** Places in the same cluster are visited together on one outing. */
  cluster: string
  /** Approximate one-way travel time from the stay base, in hours. */
  fromBaseHours: number
  /** Approximate time to spend at the place, in hours. */
  visitHours: number
  /** 1 = minor, 2 = worth it, 3 = highlight. */
  priority: 1 | 2 | 3
  /** Best visited at this time of day; used to order a day's stops. */
  timeOfDay?: 'morning' | 'evening'
  /** Months when the place is usually closed or not practical. */
  closedMonths?: Month[]
  /** Short practical note shown with the place. */
  note?: string
}

export interface SeasonNote {
  months: Month[]
  level: 'info' | 'caution' | 'avoid'
  text: string
}

/** How people usually reach a destination from far away. */
export interface AccessInfo {
  /** Nearest practical airport, with rough road time from it. */
  airport?: { name: string; code: string; roadHours: number }
  /** Nearest practical railhead, with rough road time from it. */
  railhead?: { name: string; roadHours: number }
  /**
   * Extra hours for slow last-stretch roads (hills, ghats) on a direct
   * road journey, on top of the distance-based estimate.
   */
  roadPenaltyHours?: number
  /** Most far-away flights need a connection (small or no airport). */
  connectingFlightLikely?: boolean
  /** The airport/station lookup didn't answer, so missing entries mean "unknown", not "none". */
  lookupFailed?: boolean
  note?: string
}

/**
 * Some destinations are only reached by road from another destination
 * (Spiti is reached via Manali or Shimla). The planner inserts the gateway
 * as a transit stop when the trip doesn't already pass through it.
 */
export interface Gateway {
  via: string // destination id
  roadHours: number
  /** Months when this route is usually open. Omitted = all year. */
  openMonths?: Month[]
  /** A long road day is split with an overnight halt here. */
  overnightHalt?: string
  /** Place ids (of the target destination) visited on the way. */
  enRoute?: string[]
  note?: string
}

export interface Destination {
  id: string
  name: string
  /**
   * curated: hand-checked entry in destinations.ts.
   * live: built from OpenStreetMap / Wikipedia at runtime.
   * placeholder: location unknown, no places (the person adds their own).
   * Omitted means curated.
   */
  source?: 'curated' | 'live' | 'placeholder'
  aliases?: string[]
  region: string
  /** Town you stay in, when it differs from the name (Spiti → Kaza). */
  baseName?: string
  coords: Coords
  altitudeM?: number
  /** Nights needed to make the trip worthwhile, excluding travel. */
  minNights: number
  /** Nights for a comfortable visit, excluding travel. */
  idealNights: number
  bestMonths: Month[]
  seasonNotes?: SeasonNote[]
  access: AccessInfo
  gateways?: Gateway[]
  /** Other destinations that work well combined with this one. */
  links?: { to: string; roadHours: number; note?: string }[]
  /** Suggested instead when the trip is too short or the season is wrong. */
  alternatives?: string[]
  /** Titles for clusters, keyed by cluster id. */
  clusters: Record<string, string>
  places: Place[]
}
