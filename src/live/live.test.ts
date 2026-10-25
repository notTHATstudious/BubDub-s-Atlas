import { describe, expect, it } from 'vitest'
import { planTrip } from '../engine'
import { findOrigin } from '../engine/geo'
import type { Destination } from '../data/types'
import { parsePhoton } from './geocode'
import { parseAccess, parsePlaces, type OsmElement } from './places'
import { parseGeoSearch } from './wikipedia'
import { nearestListedStation } from './resolve'

const hampi = { lat: 15.335, lon: 76.46 }

describe('live data parsing', () => {
  it('prefers towns over other features with the same name', () => {
    const results = parsePhoton([
      { geometry: { coordinates: [76.46, 15.33] }, properties: { name: 'Hampi', osm_key: 'highway', osm_value: 'bus_stop', type: 'house', country: 'India' } },
      { geometry: { coordinates: [76.46, 15.335] }, properties: { name: 'Hampi', osm_key: 'place', osm_value: 'village', state: 'Karnataka', country: 'India', county: 'Vijayanagara' } },
    ])
    expect(results[0].kind).toBe('village')
    expect(results[0].label).toBe('Vijayanagara, Karnataka, India')
  })

  const elements: OsmElement[] = [
    { type: 'node', id: 1, lat: 15.3352, lon: 76.4601, tags: { name: 'Virupaksha Temple', amenity: 'place_of_worship', religion: 'hindu', wikidata: 'Q1', wikipedia: 'en:Virupaksha Temple, Hampi' } },
    { type: 'way', id: 2, center: { lat: 15.3422, lon: 76.4747 }, tags: { name: 'Vittala Temple', tourism: 'attraction', historic: 'ruins', wikidata: 'Q2', wikipedia: 'en:Vittala Temple' } },
    { type: 'node', id: 3, lat: 15.3345, lon: 76.4595, tags: { name: 'Hemakuta Hill', tourism: 'viewpoint' } },
    { type: 'node', id: 4, lat: 15.3345, lon: 76.4596, tags: { name: 'Hemakuta Hill', tourism: 'viewpoint', wikidata: 'Q3' } },
    { type: 'node', id: 5, lat: 15.0, lon: 76.0, tags: { tourism: 'attraction' } },
    { type: 'node', id: 6, lat: 15.25, lon: 76.33, tags: { name: 'Tungabhadra Dam', natural: 'water', wikidata: 'Q4', wikipedia: 'en:Tungabhadra Dam' } },
  ]

  it('turns OpenStreetMap results into ranked, grouped places', () => {
    const { places, clusters } = parsePlaces(elements, hampi)
    expect(places.map((p) => p.name)).not.toContain(undefined)
    expect(places.filter((p) => p.name === 'Hemakuta Hill')).toHaveLength(1)
    expect(places.slice(0, 2).map((p) => p.name).sort()).toEqual(['Virupaksha Temple', 'Vittala Temple'])
    expect(places[0].priority).toBe(3)
    const virupaksha = places.find((p) => p.name === 'Virupaksha Temple')!
    const hemakuta = places.find((p) => p.name === 'Hemakuta Hill')!
    expect(hemakuta.cluster).toBe(virupaksha.cluster)
    expect(clusters[virupaksha.cluster]).toMatch(/Temple & around$/)
    expect(places.find((p) => p.name === 'Tungabhadra Dam')!.kind).toBe('lake')
  })

  it('finds the nearest airport and station', () => {
    const access = parseAccess(
      [
        { type: 'node', id: 10, lat: 15.1789, lon: 76.6338, tags: { aeroway: 'aerodrome', iata: 'VDY', name: 'Jindal Vijaynagar Airport' } },
        { type: 'node', id: 11, lat: 15.8625, lon: 74.6177, tags: { aeroway: 'aerodrome', iata: 'IXG', name: 'Belagavi Airport' } },
        { type: 'node', id: 12, lat: 15.2689, lon: 76.3909, tags: { railway: 'station', name: 'Hosapete Junction', wikidata: 'Q5' } },
      ],
      hampi,
    )
    expect(access.airport?.code).toBe('VDY')
    expect(access.railhead?.name).toBe('Hosapete Junction')
    expect(access.connectingFlightLikely).toBe(true)
  })

  it('uses a station without a Wikidata link, but prefers a junction that is only a little further', () => {
    const small = { type: 'node' as const, id: 20, lat: 15.2689, lon: 76.3909, tags: { railway: 'station', name: 'Small Road' } }
    expect(parseAccess([small], hampi).railhead?.name).toBe('Small Road')
    const junction = { type: 'node' as const, id: 21, lat: 15.2689 + 0.1, lon: 76.3909, tags: { railway: 'station', name: 'Big Junction', wikidata: 'Q9' } }
    expect(parseAccess([small, junction], hampi).railhead?.name).toBe('Big Junction')
    const farJunction = { ...junction, lat: 15.2689 + 0.5 }
    expect(parseAccess([small, farJunction], hampi).railhead?.name).toBe('Small Road')
  })

  it('filters Wikipedia hits that are not attractions', () => {
    const places = parseGeoSearch(
      [
        { pageid: 1, title: 'Hampi railway station', lat: 15.3, lon: 76.4, dist: 100 },
        { pageid: 2, title: 'Achyutaraya Temple', lat: 15.338, lon: 76.468, dist: 900 },
      ],
      hampi,
      new Set(),
    )
    expect(places.map((p) => p.name)).toEqual(['Achyutaraya Temple'])
  })

  it('plans a trip around a live destination', () => {
    const { places, clusters } = parsePlaces(elements, hampi)
    const dest: Destination = {
      id: 'live:hampi',
      name: 'Hampi',
      source: 'live',
      region: 'Karnataka, India',
      coords: hampi,
      minNights: 1,
      idealNights: 2,
      bestMonths: [],
      access: { railhead: { name: 'Hosapete Junction', roadHours: 0.5 }, airport: { name: 'Jindal Vijaynagar', code: 'VDY', roadHours: 1 } },
      clusters,
      places,
    }
    const origin = findOrigin('Bengaluru')
    const p = planTrip(
      { from: 'Bengaluru', stops: ['Hampi'], departDate: '2027-01-08', returnDate: '2027-01-10', style: 'budget' },
      { origin, returnTo: origin, stops: [dest] },
    )
    expect(p.outbound.estimate?.mode).toMatch(/train|bus/)
    expect(p.days.flatMap((d) => d.stops).some((s) => s.name === 'Virupaksha Temple')).toBe(true)
  })
})

describe('built-in station list', () => {
  it('finds a railhead for hill towns and junction cities when the live lookup has none', () => {
    const kodai = nearestListedStation({ lat: 10.2381, lon: 77.4892 })
    expect(kodai?.name).toMatch(/Kodaikanal Road|Palani/)
    expect(kodai!.roadHours).toBeLessThanOrEqual(2.5)
    expect(nearestListedStation({ lat: 20.7002, lon: 77.0082 })?.name).toBe('Akola Junction')
    expect(nearestListedStation({ lat: 34.2, lon: 77.6 })).toBeUndefined()
  })
})
