import { useState } from 'react'
import { dayText, daySignature, formatRupees, planToText, rome2rioLink, whatsappLink, type Budget, type DayEdit, type DayPlan, type DayType, type JourneyLeg, type Mode, type Notice, type PlannedStop, type TransportLink, type TransportOption, type TripPlan, type ShareSection } from '../engine'
import { formatDate, formatHour } from '../engine/dates'

const STYLE_LABEL = { budget: 'Budget', balanced: 'Balanced', premium: 'Premium' } as const

const DAY_TONE: Record<DayType, { dot: string; label: string }> = {
  travel: { dot: 'bg-sky', label: 'Travel' },
  arrival: { dot: 'bg-sun', label: 'Arrive' },
  explore: { dot: 'bg-sage', label: 'Explore' },
  daytrip: { dot: 'bg-sage', label: 'Day trip' },
  free: { dot: 'bg-line', label: 'Free' },
  transfer: { dot: 'bg-sky', label: 'Move on' },
  return: { dot: 'bg-clay', label: 'Head back' },
}

const NOTICE_TONE: Record<Notice['level'], string> = {
  info: 'border-sky/40 bg-sky/10',
  caution: 'border-sun/50 bg-sun/15',
  avoid: 'border-clay/40 bg-clay/10',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

function hours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`
  const r = Math.round(h * 2) / 2
  return `${r} h`
}

export interface PlanEditor {
  editing: boolean
  edits: Record<number, DayEdit>
  remove: (placeId: string) => void
  include: (placeId: string) => void
  move: (placeId: string, day: number) => void
  addCustom: (stopId: string, name: string) => void
  restore: (placeId: string) => void
  saveDay: (d: DayPlan, title: string, summary: string) => void
  resetDay: (day: number) => void
}

const iconBtn = 'rounded-lg border border-line bg-white px-2 py-0.5 text-xs text-muted hover:border-pine hover:text-pine'

function PlaceRow({ p, faded, ed, moveTo, optional }: { p: PlannedStop; faded?: boolean; ed: PlanEditor; moveTo: DayPlan[]; optional?: boolean }) {
  const canEdit = ed.editing && !p.enRoute
  return (
    <li className={`flex items-start justify-between gap-3 py-1.5 ${faded ? 'text-muted' : ''}`}>
      <span className="min-w-0">
        <span className="font-medium">{p.name}</span>
        {p.custom && <span className="ml-2 rounded-full bg-sun/20 px-2 py-0.5 text-[11px] text-ink">your pick</span>}
        {p.enRoute && <span className="ml-2 rounded-full bg-sky/20 px-2 py-0.5 text-[11px] text-ink">on the way</span>}
        {p.note && <span className="block text-xs text-muted">{p.note}</span>}
        {canEdit && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {optional && (
              <button type="button" className={iconBtn} onClick={() => ed.include(p.placeId)}>
                + Add to plan
              </button>
            )}
            {moveTo.length > 0 && (
              <select aria-label={`Move ${p.name} to another day`} className={`${iconBtn} text-base`} value="" onChange={(e) => e.target.value && ed.move(p.placeId, Number(e.target.value))}>
                <option value="">Move to…</option>
                {moveTo.map((d) => (
                  <option key={d.day} value={d.day}>Day {d.day}</option>
                ))}
              </select>
            )}
            <button type="button" className={`${iconBtn} hover:border-clay hover:text-clay`} onClick={() => ed.remove(p.placeId)}>
              Remove
            </button>
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted">{hours(p.visitHours)}</span>
    </li>
  )
}

function DayText({ d, ed }: { d: DayPlan; ed: PlanEditor }) {
  const t = dayText(d, ed.edits)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(t.title)
  const [summary, setSummary] = useState(t.summary)
  if (ed.editing && open) {
    return (
      <div className="mt-2 space-y-2">
        <input className="w-full rounded-xl border border-line px-3 py-2 text-base font-semibold outline-none focus:border-pine" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Day title" />
        <textarea rows={3} className="w-full rounded-xl border border-line px-3 py-2 text-base outline-none focus:border-pine" value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Day plan" />
        <div className="flex gap-2">
          <button type="button" className="rounded-full bg-pine px-3 py-1.5 text-xs font-semibold text-cream" onClick={() => { ed.saveDay(d, title.trim() || d.title, summary.trim()); setOpen(false) }}>
            Save
          </button>
          <button type="button" className="rounded-full border border-line px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <>
      <h3 className="mt-2 text-lg font-semibold leading-snug">{t.title}</h3>
      <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-ink/80">{t.summary}</p>
      {ed.editing && (
        <div className="mt-2 flex gap-2">
          <button type="button" className={iconBtn} onClick={() => { setTitle(t.title); setSummary(t.summary); setOpen(true) }}>Edit text</button>
          {t.edited && <button type="button" className={iconBtn} onClick={() => ed.resetDay(d.day)}>Undo text edit</button>}
        </div>
      )}
    </>
  )
}

function DayCard({ d, ed, days }: { d: DayPlan; ed: PlanEditor; days: DayPlan[] }) {
  const tone = DAY_TONE[d.type]
  const placeNotes = [...d.stops, ...d.optional].map((p) => p.note).filter((n): n is string => !!n)
  const notes = d.notes.filter((n) => !placeNotes.some((pn) => n.endsWith(pn)))
  const moveTo = days.filter((x) => x !== d && x.stopId === d.stopId && x.type !== 'travel')
  return (
    <li className={`relative rounded-3xl border bg-white p-5 shadow-sm shadow-ink/5 ${ed.editing ? 'border-pine/30' : 'border-line'}`}>
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Day {d.day} · {weekday(d.date)} {formatDate(d.date)} · {tone.label}
        </p>
      </div>
      <DayText key={`${d.day}:${daySignature(d)}`} d={d} ed={ed} />
      {d.transfer && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Bus or cab, about {hours(d.transfer.hours)}:</span>
          <Links links={d.transfer.links} />
        </div>
      )}
      {d.stops.length > 0 && (
        <ul className="mt-3 divide-y divide-line/70 border-t border-line/70 text-sm">
          {d.stops.map((p) => <PlaceRow key={p.placeId} p={p} ed={ed} moveTo={moveTo} />)}
        </ul>
      )}
      {d.optional.length > 0 && (
        <div className="mt-3 rounded-2xl bg-sand/40 px-4 py-2">
          <p className="text-xs font-medium text-pine">If time allows</p>
          <ul className="text-sm">{d.optional.map((p) => <PlaceRow key={p.placeId} p={p} faded ed={ed} moveTo={moveTo} optional />)}</ul>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted">
          {notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

function AddPlace({ stopId, name, ed }: { stopId: string; name: string; ed: PlanEditor }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) ed.addCustom(stopId, value.trim())
        setValue('')
      }}
    >
      <input className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-base outline-none focus:border-pine" placeholder={`Add your own place in ${name}`} value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="rounded-xl bg-pine px-3 py-2 text-sm font-semibold text-cream">Add</button>
    </form>
  )
}

/** Copies text, with a fallback for browsers without the async clipboard. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

function CopyButton({ text, label, className }: { text: () => string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={className ?? 'text-xs font-medium text-pine hover:underline'}
      onClick={async () => {
        if (await copyText(text())) {
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}

const MODE_NAME: Record<Mode, string> = { flight: 'Flight', train: 'Train', bus: 'Bus', car: 'By road' }

function fare(o: TransportOption): string {
  const [lo, hi] = o.fare
  const amount = lo === hi ? formatRupees(lo) : `${formatRupees(lo)}–${formatRupees(hi)}`
  return `${amount} ${o.perCar ? 'per car' : 'per person'}`
}

function Links({ links }: { links: TransportLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-pine hover:border-pine">
          {l.label} ↗
        </a>
      ))}
    </div>
  )
}

function LegCard({ title, leg, accent, date }: { title: string; leg: JourneyLeg; accent: string; date: string }) {
  const options = leg.options ?? []
  const best = options.find((o) => o.recommended) ?? options[0]
  const others = options.filter((o) => o !== best)
  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-6 rounded-full ${accent}`} aria-hidden />
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          {title} · {weekday(date)} {formatDate(date)}
        </p>
      </div>
      <p className="mt-2 font-semibold">
        {leg.from} → {leg.to}
      </p>
      {best ? (
        <div className="mt-3 rounded-2xl bg-sand/40 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              {MODE_NAME[best.mode]} <span className="font-normal text-muted">· about {hours(best.hours)} door to door</span>
            </p>
            {best.recommended && <span className="shrink-0 rounded-full bg-pine px-2 py-0.5 text-[11px] font-medium text-cream">Suggested</span>}
          </div>
          {best.why && <p className="mt-1 text-xs text-muted">{best.why}</p>}
          <ol className="mt-2 space-y-0.5 text-sm text-ink/80">
            {best.steps.map((st, i) => (
              <li key={i}>{i + 1}. {st}</li>
            ))}
          </ol>
          {leg.departHour !== undefined && best.recommended && (
            <p className="mt-2 text-xs text-muted">
              The days are planned for leaving {leg.timeAssumed ? 'around ' : 'at '}{formatHour(leg.departHour)}
              {leg.arrival ? ` and arriving around ${formatHour(leg.arrival.hour)} on ${formatDate(leg.arrival.date)}` : ''}.
            </p>
          )}
          <p className="mt-2 text-sm font-medium">{fare(best)}</p>
          <div className="mt-3"><Links links={best.links} /></div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">We couldn't place this route on the map, so there are no options to compare.</p>
      )}
      {others.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted hover:text-ink">
            <span className="inline-block transition group-open:rotate-90">›</span> Other ways ({others.map((o) => MODE_NAME[o.mode].toLowerCase()).join(', ')})
          </summary>
          <ul className="mt-2 divide-y divide-line/70">
            {others.map((o) => (
              <li key={o.mode} className="py-3">
                <p className="text-sm font-semibold">
                  {MODE_NAME[o.mode]} <span className="font-normal text-muted">· about {hours(o.hours)} · {fare(o)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{o.steps.map((st, i) => (i ? st[0].toLowerCase() + st.slice(1) : st)).join(', then ')}</p>
                <div className="mt-2"><Links links={o.links} /></div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>Times and fares are rough estimates. Search links show live ones.</span>
        <a href={rome2rioLink(leg.from, leg.to).url} target="_blank" rel="noreferrer" className="font-medium text-pine hover:underline">Compare all routes ↗</a>
      </div>
    </div>
  )
}

function BudgetCard({ budget, style }: { budget: Budget; style: string }) {
  const r = (x: [number, number]) => `${formatRupees(x[0])}–${formatRupees(x[1])}`
  return (
    <section className="rounded-3xl border border-line bg-white p-5" aria-label="Budget">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Rough budget</h2>
        <span className="text-xs text-muted">{style} style · {budget.travellers} {budget.travellers === 1 ? 'traveller' : 'travellers'}</span>
      </div>
      <ul className="mt-3 divide-y divide-line/70 text-sm">
        {budget.lines.map((l) => (
          <li key={l.label} className="flex items-start justify-between gap-3 py-2">
            <span>
              {l.label}
              <span className="block text-xs text-muted">{l.detail}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums">{r(l.range)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end justify-between gap-3 panel rounded-2xl bg-pine px-4 py-3 text-cream">
        <span className="text-sm">Total</span>
        <span className="text-right">
          <span className="block text-lg font-semibold tabular-nums">{r(budget.total)}</span>
          <span className="block text-xs text-cream/70 tabular-nums">about {r(budget.perPerson)} per person</span>
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Rough estimate. {budget.basis} Shopping and paid adventure activities are extra.
      </p>
    </section>
  )
}

interface Props {
  plan: TripPlan
  loading: boolean
  editor: PlanEditor
  onToggleEdit: () => void
  shareUrl: () => string
  /** Starts a Weyvo travel story from this plan. */
  weyvoUrl: () => string
  onEdit: () => void
  onExtend: (returnDate: string) => void
  onNew: () => void
  saved: boolean
  saveFailed: boolean
  onSave: () => void
}

export function PlanView({ plan, loading, editor: ed, onToggleEdit, shareUrl, weyvoUrl, onEdit, onExtend, onNew, saved, saveFailed, onSave }: Props) {
  const text = (section: ShareSection = 'all') => planToText(plan, ed.edits, section)
  const input = plan.input
  const home = plan.inbound.to
  const routeLine = [plan.outbound.from, ...plan.route.map((r) => r.name), home]
  const leftovers = Object.entries(plan.leftovers).filter(([, ps]) => ps.length > 0)
  const userStops = plan.route.filter((r, i, all) => !r.transit && all.findIndex((x) => x.id === r.id) === i)
  const allPlaces = Object.values(plan.candidates).flat()
  const removed = (input.excludedPlaceIds ?? []).map((id) => allPlaces.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  const places = plan.route.filter((r) => !r.transit).map((r) => r.name)
  const heading = places.length > 1 ? `${places.slice(0, -1).join(', ')} & ${places[places.length - 1]}` : (places[0] ?? plan.title)

  return (
    <div className="space-y-6">
      <header className="panel rounded-3xl bg-pine px-6 py-7 text-cream sm:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-cream/60">Your trip</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {heading} <span className="font-normal text-cream/60">from {plan.outbound.from}</span>
        </h2>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-cream/80">
          {routeLine.map((name, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-cream/40">→</span>}
              <span>
                {name}
                {i > 0 && i <= plan.route.length && <span className="text-cream/50"> · {plan.route[i - 1].nights}n</span>}
              </span>
            </span>
          ))}
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-cream/10 px-3 py-1.5">
            {formatDate(plan.startDate)} – {formatDate(plan.endDate)}
          </span>
          <span className="rounded-full bg-cream/10 px-3 py-1.5">{plan.totalDays} {plan.totalDays === 1 ? 'day' : 'days'}</span>
          {input.travellers && <span className="rounded-full bg-cream/10 px-3 py-1.5">{input.travellers} {input.travellers === 1 ? 'traveller' : 'travellers'}</span>}
          <span className="rounded-full bg-cream/10 px-3 py-1.5">{STYLE_LABEL[input.style ?? 'balanced']}</span>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={onToggleEdit} aria-pressed={ed.editing} className="rounded-full bg-sand px-4 py-2 text-sm font-semibold text-pine hover:bg-white">
            {ed.editing ? 'Done editing' : 'Edit plan'}
          </button>
          <button onClick={onEdit} className="rounded-full border border-cream/30 px-4 py-2 text-sm text-cream hover:bg-cream/10">Change trip details</button>
          <button onClick={onNew} className="rounded-full border border-cream/30 px-4 py-2 text-sm text-cream hover:bg-cream/10">New trip</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={onSave} disabled={saved} className="rounded-full border border-cream/30 px-4 py-2 text-sm text-cream hover:bg-cream/10 disabled:opacity-80">
            {saved ? '✓ Saved on this phone' : 'Save for offline'}
          </button>
          {saveFailed && <span className="text-xs text-cream/80">Couldn't save: this browser blocked storage.</span>}
          {saved && <span className="text-xs text-cream/60">Opens without internet. Edits update the saved copy.</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={() => text()} label="Copy plan" className="rounded-full bg-cream px-4 py-2 text-sm font-semibold text-pine hover:bg-white copy-plan" />
          <a href={whatsappLink(text())} target="_blank" rel="noreferrer" className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#fff] hover:opacity-90">
            Share on WhatsApp
          </a>
          <CopyButton text={shareUrl} label="Copy link" className="rounded-full border border-cream/30 px-4 py-2 text-sm text-cream hover:bg-cream/10" />
        </div>
        <a href={weyvoUrl()} className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-cream/10 px-4 py-3 text-sm text-cream hover:bg-cream/15">
          <span>
            <span className="block font-semibold">Write this trip on Weyvo</span>
            <span className="block text-xs text-cream/70">Back from it? Your days become a travel story; add photos and your words.</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      </header>

      {plan.extendTo && (
        <div className="flex flex-col gap-3 rounded-3xl border border-clay/40 bg-clay/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">{plan.droppedStops.join(' and ')} didn't fit in these dates.</span> Heading back on {weekday(plan.extendTo)} {formatDate(plan.extendTo)} fits every stop.
          </p>
          <button disabled={loading} onClick={() => onExtend(plan.extendTo!)} className="shrink-0 rounded-full bg-pine px-4 py-2 text-sm font-semibold text-cream hover:bg-pine/90 disabled:opacity-60">
            {loading ? 'Replanning…' : `Plan till ${formatDate(plan.extendTo)}`}
          </button>
        </div>
      )}

      {plan.warnings.length > 0 && (
        <section className="space-y-2" aria-label="Things to know">
          {plan.warnings.filter((w) => !(plan.extendTo && /left out\. To fit everything/.test(w.text))).map((w, i) => (
            <p key={i} className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${NOTICE_TONE[w.level]}`}>{w.text}</p>
          ))}
        </section>
      )}

      {ed.editing && (
        <p className="rounded-2xl border border-pine/30 bg-pine/5 px-4 py-3 text-sm leading-relaxed">
          Editing: remove or move places, add your own, or rewrite a day's text. The plan updates as you go. Tap <b>Done editing</b> when finished.
        </p>
      )}

      <section className="space-y-3" aria-label="Getting there and back">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Getting there and back</h2>
          <CopyButton text={() => text('transport')} label="Copy" />
        </div>
        <LegCard title="Going" leg={plan.outbound} accent="bg-sky" date={plan.startDate} />
        <LegCard title="Return" leg={plan.inbound} accent="bg-clay" date={plan.endDate} />
      </section>

      <section aria-label="Day by day">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Day by day</h2>
          <CopyButton text={() => text('itinerary')} label="Copy" />
        </div>
        <ol className="space-y-3">{plan.days.map((d) => <DayCard key={d.day} d={d} ed={ed} days={plan.days} />)}</ol>
      </section>

      {plan.budget && <BudgetCard budget={plan.budget} style={STYLE_LABEL[input.style ?? 'balanced']} />}

      {(plan.suggestions.length > 0 || leftovers.length > 0 || ed.editing || removed.length > 0) && (
        <section className="rounded-3xl border border-line bg-white/70 p-5" aria-label="More places">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{ed.editing ? 'Add places' : 'Ideas'}</h2>
          {plan.suggestions.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
              {plan.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {userStops.map((r) => {
            const ps = plan.leftovers[r.id] ?? []
            if (!ps.length && !ed.editing) return null
            return (
              <div key={r.id} className="mt-4">
                {ps.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted">{ed.editing ? `Tap to add near ${r.name}` : `Also worth a look near ${r.name}, if you have more time`}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ps.map((p) =>
                        ed.editing ? (
                          <button key={p.placeId} type="button" onClick={() => ed.include(p.placeId)} className="rounded-full border border-pine/40 bg-white px-3 py-1 text-sm text-pine hover:bg-pine/5">
                            + {p.name}
                          </button>
                        ) : (
                          <span key={p.placeId} className="rounded-full border border-line bg-white px-3 py-1 text-sm">{p.name}</span>
                        ),
                      )}
                    </div>
                  </>
                )}
                {ed.editing && <AddPlace stopId={r.id} name={r.name} ed={ed} />}
              </div>
            )
          })}
          {removed.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Removed from the plan</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {removed.map((p) => (
                  <button key={p.id} type="button" onClick={() => ed.restore(p.id)} className="rounded-full border border-line bg-white px-3 py-1 text-sm text-muted line-through decoration-clay/60 hover:text-ink">
                    {p.name} <span className="no-underline">↺</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
