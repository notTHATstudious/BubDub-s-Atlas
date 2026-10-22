import { formatRupees } from './budget'
import { formatDate, formatHour } from './dates'
import type { DayPlan, JourneyLeg, TripPlan } from './types'

// Plain-text version of a plan for copying into WhatsApp or any chat.
// Upper-case headings and short lines, no markdown, so it reads well anywhere.

/** Text the person rewrote for a day. `sig` is the day's places when edited. */
export interface DayEdit {
  title: string
  summary: string
  sig: string
}

export type ShareSection = 'all' | 'transport' | 'itinerary'

const STYLE = { budget: 'Budget', balanced: 'Balanced', premium: 'Premium' } as const
const MODE = { flight: 'Flight', train: 'Train', bus: 'Bus', car: 'By road' } as const

export function daySignature(d: DayPlan): string {
  return d.stops.map((s) => s.placeId).join('|')
}

/** The day's title and summary, with the person's rewrite if it still fits. */
export function dayText(d: DayPlan, edits: Record<number, DayEdit> = {}): { title: string; summary: string; edited: boolean } {
  const e = edits[d.day]
  if (e && e.sig === daySignature(d)) return { title: e.title, summary: e.summary, edited: true }
  return { title: d.title, summary: d.summary, edited: false }
}

const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 2) / 2} h`)
const money = (r: [number, number]) => (r[0] === r[1] ? formatRupees(r[0]) : `${formatRupees(r[0])}–${formatRupees(r[1])}`)

function legText(title: string, leg: JourneyLeg): string[] {
  const lines = [title, `${leg.from} → ${leg.to}`]
  const options = leg.options ?? []
  const best = options.find((o) => o.recommended) ?? options[0]
  if (!best) {
    lines.push('Compare train, bus and flight options before booking.')
    return lines
  }
  lines.push(`Suggested: ${MODE[best.mode].toLowerCase()}, about ${hours(best.hours)} door to door`)
  for (const st of best.steps) lines.push(`- ${st}`)
  lines.push(`Approx. ${money(best.fare)} ${best.perCar ? 'per car' : 'per person'} (estimate)`)
  const others = options.filter((o) => o !== best)
  if (others.length) lines.push(`Also possible: ${others.map((o) => `${MODE[o.mode].toLowerCase()} ~${hours(o.hours)}`).join(', ')}`)
  if (best.links[0]) lines.push(`Search: ${best.links[0].url}`)
  return lines
}

function datesLine(plan: TripPlan): string {
  const out = plan.outbound
  const back = plan.inbound
  const start = `${formatDate(plan.startDate)}${out.departHour !== undefined ? `, ${formatHour(out.departHour)}` : ''}`
  const end = `${formatDate(plan.endDate)}${back.departHour !== undefined ? `, ${formatHour(back.departHour)}` : ''}`
  return `Dates: ${start} – ${end}`
}

export function planToText(plan: TripPlan, edits: Record<number, DayEdit> = {}, section: ShareSection = 'all'): string {
  const blocks: string[][] = []
  const input = plan.input
  if (section === 'all') {
    const head = [plan.title, datesLine(plan), `Duration: ${plan.totalDays} ${plan.totalDays === 1 ? 'day' : 'days'}`]
    const who = [input.travellers ? `Travellers: ${input.travellers}` : '', `Travel style: ${STYLE[input.style ?? 'balanced']}`].filter(Boolean)
    head.push(who.join(' · '))
    blocks.push(head)
  }
  if (section !== 'itinerary') blocks.push(legText('GOING', plan.outbound))
  if (section !== 'transport') {
    for (const d of plan.days) {
      const t = dayText(d, edits)
      const lines = [`DAY ${d.day} — ${t.title.toUpperCase()} (${formatDate(d.date)})`, t.summary]
      if (d.optional.length) lines.push(`If time allows: ${d.optional.map((o) => o.name).join(', ')}`)
      blocks.push(lines)
    }
  }
  if (section !== 'itinerary') blocks.push(legText('RETURN', plan.inbound))
  if (section === 'all' && plan.budget) {
    const b = plan.budget
    blocks.push([
      'BUDGET (rough estimate)',
      ...b.lines.map((l) => `${l.label}: ${money(l.range)}`),
      `Total: ${money(b.total)}${b.travellers > 1 ? ` (about ${money(b.perPerson)} per person)` : ''}`,
    ])
  }
  if (section === 'all') blocks.push(['Times and prices are estimates. Check live options before booking.', "Planned with BubDub's Atlas"])
  return blocks.map((b) => b.filter(Boolean).join('\n')).join('\n\n')
}

export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
