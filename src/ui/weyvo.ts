import { dayText, type DayEdit, type TripPlan } from '../engine'
import type { TravelStyle } from '../engine/journey'
import { emptyForm, type FormState } from './form'

// BubDub's Atlas is Weyvo's trip-planning companion. Weyvo opens Atlas with a trip filled in
// (?ref=weyvo&to=…), and Atlas sends a finished plan back to Weyvo to start a travel story.

export const WEYVO_URL = 'https://weyvo-web.onrender.com'
const BACK_KEY = 'tp-weyvo-back'

/** Where "Back to Weyvo" goes for this visit, or undefined when Atlas wasn't opened from Weyvo. */
export function weyvoBack(): string | undefined {
  try {
    const path = sessionStorage.getItem(BACK_KEY)
    return path ? WEYVO_URL + path : undefined
  } catch {
    return undefined
  }
}

const STYLES: TravelStyle[] = ['budget', 'balanced', 'premium']
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Reads a link from Weyvo. Returns the trip to fill in (and whether it's complete enough to plan straight
 * away), remembers where "Back to Weyvo" goes, and tidies the address bar.
 */
export function readWeyvoLink(search: string): { form: FormState; ready: boolean } | undefined {
  const q = new URLSearchParams(search)
  if (q.get('ref') !== 'weyvo') return undefined
  const back = q.get('back') ?? '/plan'
  try {
    sessionStorage.setItem(BACK_KEY, back.startsWith('/') && !back.startsWith('//') ? back.slice(0, 200) : '/plan')
  } catch {
    // Without storage the bar just doesn't show.
  }
  history.replaceState(null, '', location.pathname)
  const f = emptyForm()
  const to = (q.get('to') ?? '').trim().slice(0, 120)
  const from = (q.get('from') ?? '').trim().slice(0, 120)
  if (to) f.stops = [{ name: to }]
  if (from) f.from = { name: from }
  if (isDate(q.get('depart'))) f.departDate = q.get('depart')!
  if (isDate(q.get('return')) && q.get('return')! >= f.departDate) f.returnDate = q.get('return')!
  const style = q.get('style') as TravelStyle | null
  if (style && STYLES.includes(style)) f.style = style
  return { form: f, ready: !!to && !!from }
}

/** A Weyvo "new full trip" link carrying this plan after #, so it never reaches a server. */
export function weyvoStoryLink(plan: TripPlan, edits: Record<number, DayEdit>): string {
  const places = plan.route.filter((r, i, all) => !r.transit && all.findIndex((x) => x.id === r.id) === i).map((r) => r.name)
  const title = places.length > 1 ? `${places.slice(0, -1).join(', ')} & ${places[places.length - 1]}` : (places[0] ?? plan.title)
  const story = {
    title: (`${plan.totalDays} days in ${title}`.length <= 60 ? `${plan.totalDays} days in ${title}` : title).slice(0, 60),
    place: (places[0] ?? plan.title).slice(0, 120),
    start: plan.startDate,
    end: plan.endDate,
    intro: `${plan.totalDays} ${plan.totalDays === 1 ? 'day' : 'days'} from ${plan.outbound.from}: ${[plan.outbound.from, ...places, plan.inbound.to].join(' → ')}.`.slice(0, 250),
    sections: plan.days.slice(0, 8).map((d) => {
      const t = dayText(d, edits)
      const stops = d.stops.map((s) => s.name)
      const body = [t.summary, stops.length ? `Places: ${stops.join(', ')}.` : ''].filter(Boolean).join(' ')
      return { heading: `Day ${d.day} · ${t.title}`.slice(0, 60), body: body.slice(0, 500) }
    }),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(story))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `${WEYVO_URL}/create?type=full#atlas=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}
