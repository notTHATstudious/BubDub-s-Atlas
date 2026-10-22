import type { Coords } from '../data/types'
import { fetchJson } from './http'

// Open-Meteo's free elevation API (no key, CORS enabled). Used only for the
// high-altitude acclimatisation rule.
export async function elevation(c: Coords): Promise<number | undefined> {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${c.lat.toFixed(4)}&longitude=${c.lon.toFixed(4)}`
    const data = await fetchJson<{ elevation?: number[] }>(url, {}, 8_000)
    const m = data.elevation?.[0]
    return typeof m === 'number' && Number.isFinite(m) ? Math.round(m) : undefined
  } catch {
    return undefined
  }
}
