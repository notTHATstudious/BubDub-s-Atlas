// Small fetch helper for the free open-data services. Responses are cached
// in memory and, when available, in localStorage for a week, so repeat
// plans don't hit the services again (they ask for fair use).

const TTL_MS = 7 * 24 * 3600 * 1000
const memory = new Map<string, unknown>()

function readCache<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = localStorage.getItem(`tp:${key}`)
    if (!raw) return undefined
    const { at, value } = JSON.parse(raw) as { at: number; value: T }
    if (Date.now() - at > TTL_MS) return undefined
    memory.set(key, value)
    return value
  } catch {
    return undefined
  }
}

function writeCache(key: string, value: unknown) {
  memory.set(key, value)
  try {
    localStorage.setItem(`tp:${key}`, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // Storage full or blocked: the in-memory copy is enough.
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const key = `${init.method ?? 'GET'} ${url} ${typeof init.body === 'string' ? init.body : ''}`
  const cached = readCache<T>(key)
  if (cached !== undefined) return cached
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
    const value = (await res.json()) as T
    writeCache(key, value)
    return value
  } finally {
    clearTimeout(timer)
  }
}
