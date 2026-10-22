import type { Month } from '../data/types'

// Dates are plain YYYY-MM-DD strings handled in UTC, so the planner gives
// the same answer in every time zone.

const DAY_MS = 86_400_000

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const t = parse(date)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === date
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / DAY_MS)
}

export function addDays(date: string, n: number): string {
  return new Date(parse(date) + n * DAY_MS).toISOString().slice(0, 10)
}

export function monthOf(date: string): Month {
  return (new Date(parse(date)).getUTCMonth() + 1) as Month
}

/** "21:30" → 21.5. Returns undefined for missing or malformed input. */
export function parseTime(time?: string): number | undefined {
  if (!time) return undefined
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return h + min / 60
}

/** 21.5 → "21:30". */
export function formatHour(hour: number): string {
  const total = Math.round((((hour % 24) + 24) % 24) * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-12-24" → "24 Dec". */
export function formatDate(date: string): string {
  const d = new Date(parse(date))
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function monthName(m: Month): string {
  return MONTHS[m - 1]
}

/** [10, 11, 12, 1, 2] → "Oct–Feb" for a contiguous run, else a list. */
export function formatMonths(months: Month[]): string {
  if (months.length === 0) return ''
  if (months.length === 12) return 'all year'
  const set = new Set(months)
  // Find a month whose predecessor isn't in the set: that's where a run starts.
  const start = months.find((m) => !set.has((((m + 10) % 12) + 1) as Month))
  if (start === undefined) return 'all year'
  let end = start
  let count = 1
  while (set.has(((end % 12) + 1) as Month) && count < months.length) {
    end = ((end % 12) + 1) as Month
    count++
  }
  if (count === months.length) return `${monthName(start)}–${monthName(end)}`
  return months.map(monthName).join(', ')
}
