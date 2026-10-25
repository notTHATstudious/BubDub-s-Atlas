import type { Destination, Interest, Place, PlaceKind } from '../data/types'
import type { JourneyEstimate, TransportPref, TravelStyle } from './journey'
import type { Origin } from './geo'
import type { Budget } from './budget'
import type { TransportLink, TransportOption } from './transport'

export interface TripInput {
  from: string
  /** One or more destinations, in travel order. */
  stops: string[]
  /** Where the trip ends. Defaults to `from`. */
  returnTo?: string
  /** YYYY-MM-DD */
  departDate: string
  /** YYYY-MM-DD: the day you leave the last destination for home. */
  returnDate: string
  /** HH:MM, when you leave home. Optional. */
  departTime?: string
  /** HH:MM, when you leave the last destination. Optional. */
  returnTime?: string
  travellers?: number
  style?: TravelStyle
  transport?: TransportPref
  interests?: Interest[]
  excludedPlaceIds?: string[]
  /** Places the person wants in the plan even if they rank low. */
  includedPlaceIds?: string[]
  /** Places the person moved to another day: place id → day number (1-based). */
  moves?: Record<string, number>
  /** Places the person adds themselves, by destination id. */
  customPlaces?: { stopId: string; name: string }[]
  notes?: string
}

/** Everything the planner needs, already looked up (curated or live data). */
export interface ResolvedTrip {
  origin: Origin
  returnTo: Origin
  stops: Destination[]
}

export interface Notice {
  level: 'info' | 'caution' | 'avoid'
  text: string
}

export interface PlannedStop {
  placeId: string
  name: string
  cluster: string
  clusterTitle: string
  fromBaseHours: number
  visitHours: number
  note?: string
  /** What sort of place it is; custom places have none. */
  kind?: PlaceKind
  custom?: boolean
  /** Visited on the road between two stops. */
  enRoute?: boolean
}

export type DayType = 'travel' | 'arrival' | 'explore' | 'free' | 'transfer' | 'return' | 'daytrip'

export interface DayPlan {
  /** 1-based. */
  day: number
  /** YYYY-MM-DD */
  date: string
  type: DayType
  title: string
  /** Destination id the night is spent at (or left from, on the last day). */
  stopId?: string
  /** Rough hours available for sightseeing that day. */
  capacityHours: number
  stops: PlannedStop[]
  /** Fits if the day goes well; not part of the main plan. */
  optional: PlannedStop[]
  /** One or two short lines. */
  summary: string
  /** Short practical notes: rough travel times, permits, seasonal caveats. */
  notes: string[]
  /** On a day you move between stops: the road leg and search links. */
  transfer?: { from: string; to: string; hours: number; links: TransportLink[] }
}

export interface RouteStop {
  id: string
  name: string
  nights: number
  /** Inserted by the planner to reach another stop (e.g. Manali for Spiti). */
  transit: boolean
}

export interface JourneyLeg {
  from: string
  to: string
  estimate?: JourneyEstimate
  /** Decimal hours from midnight of the leg's start date. */
  departHour?: number
  /** True when the time was assumed rather than given by the person. */
  timeAssumed: boolean
  /** YYYY-MM-DD and hour, rough. */
  arrival?: { date: string; hour: number }
  /** Every sensible way to make this leg, recommended first. */
  options?: TransportOption[]
}

export interface TripPlan {
  input: TripInput
  title: string
  route: RouteStop[]
  /** Requested stops that didn't fit and were left out. */
  droppedStops: string[]
  /** When stops were left out: the return date that would fit all of them. */
  extendTo?: string
  /** Rough cost in ₹, when the plan works. */
  budget?: Budget
  startDate: string
  endDate: string
  totalDays: number
  outbound: JourneyLeg
  inbound: JourneyLeg
  days: DayPlan[]
  /** Good places that didn't fit, per stop, for "add to plan". */
  leftovers: Record<string, PlannedStop[]>
  /** Every candidate place per stop, for the exclude / include UI. */
  candidates: Record<string, Place[]>
  warnings: Notice[]
  suggestions: string[]
}
