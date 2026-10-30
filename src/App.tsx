import { useEffect, useRef, useState } from 'react'
import { customPlaceId, daySignature, planTrip, type DayEdit, type TripPlan } from './engine'
import type { LiveResolved } from './live'
import { lookUpTrip, PlanError } from './ui/lookup'
import { emptyForm, loadForm, pickedPlaces, readShareLink, saveForm, shareLink, toInput, type FormState } from './ui/form'
import { formatDate } from './engine/dates'
import { InstallHint } from './ui/InstallHint'
import { SettingsMenu } from './ui/SettingsMenu'
import { SavedTrips } from './ui/SavedTrips'
import { newTripId, saveTrip, type SavedTrip } from './ui/store'
import { PlanView, type PlanEditor } from './ui/PlanView'
import { TripForm } from './ui/TripForm'
import { EMBED, readWeyvoLink, weyvoStoryLink, WEYVO_URL } from './ui/weyvo'
import { ByWeyvo, WeyvoBar, WeyvoInvite } from './ui/WeyvoBits'

const shared = readShareLink(location.hash)
// Opened from Weyvo (Plan tab, a story or a destination): the trip comes filled in.
const fromWeyvo = shared ? undefined : readWeyvoLink(location.search)
const YEAR = new Date().getFullYear()

/** Which lookups a form needs: replanning without a new lookup is instant. */
const placesKey = (f: FormState, online: boolean) => JSON.stringify([online, f.from.name.trim(), f.stops.map((s) => s.name.trim()), pickedPlaces(f)])

/** Follows the browser's online / offline state. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

export default function App() {
  const [form, setForm] = useState<FormState>(() => shared?.form ?? fromWeyvo?.form ?? loadForm() ?? emptyForm())
  const [plan, setPlan] = useState<TripPlan>()
  const [edits, setEdits] = useState<Record<number, DayEdit>>(() => shared?.edits ?? {})
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(!!shared || !!fromWeyvo?.ready)
  const resolved = useRef<{ key: string; data: LiveResolved }>(undefined)
  const top = useRef<HTMLDivElement>(null)
  const online = useOnline()
  const [savedId, setSavedId] = useState<string>()
  const [saveFailed, setSaveFailed] = useState(false)

  /** Writes the open plan to the phone; `id` is the saved copy to update. */
  function store(id: string): boolean {
    if (!plan || !resolved.current) return false
    const names = plan.route.filter((r, i, all) => !r.transit && all.findIndex((x) => x.id === r.id) === i).map((r) => r.name)
    return saveTrip({
      id,
      savedAt: Date.now(),
      label: `${names.join(' & ') || plan.title} from ${plan.outbound.from}`,
      dates: `${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}`,
      form,
      edits,
      resolved: resolved.current.data,
    })
  }

  // Once saved, edits keep the saved copy current.
  useEffect(() => {
    if (savedId) store(savedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, edits])

  function openSaved(t: SavedTrip) {
    resolved.current = { key: placesKey(t.form, navigator.onLine), data: t.resolved }
    setForm(t.form)
    setEdits(t.edits)
    setEditing(false)
    setError(undefined)
    setSavedId(t.id)
    setPlan(build(t.form, t.resolved))
    top.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => saveForm(form), [form])

  // Inside Weyvo: tell the Plan tab a plan is ready (no trip details), so it can offer to install Atlas.
  useEffect(() => {
    if (EMBED.on && plan && window.parent !== window) window.parent.postMessage({ type: 'atlas:planned' }, '*')
  }, [plan])

  function build(f: FormState, data: LiveResolved): TripPlan {
    const p = planTrip(toInput(f), data)
    p.warnings.unshift(...data.notices)
    return p
  }

  async function makePlan(f: FormState = form) {
    setLoading(true)
    setError(undefined)
    try {
      const isOnline = navigator.onLine
      const key = placesKey(f, isOnline)
      if (resolved.current?.key !== key) {
        const data = await lookUpTrip(toInput(f), pickedPlaces(f), isOnline)
        // A lookup that half-failed is used now but never matches again, so planning again retries it.
        resolved.current = { key: data.stops.some((s) => s.access.lookupFailed) ? `${key}!${Date.now()}` : key, data }
      }
      setPlan(build(f, resolved.current.data))
      top.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setPlan(undefined)
      setError(err instanceof PlanError ? err.message : `Something went wrong: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // Opening a shared link plans that trip straight away.
  const openedShared = useRef(false)
  useEffect(() => {
    if (!shared || openedShared.current) return
    openedShared.current = true
    history.replaceState(null, '', location.pathname)
    void makePlan(shared.form)
  })

  // From Weyvo with a starting city and a destination: plan straight away.
  const openedWeyvo = useRef(false)
  useEffect(() => {
    if (!fromWeyvo?.ready || openedWeyvo.current) return
    openedWeyvo.current = true
    void makePlan(fromWeyvo.form)
  })

  /** Applies a plan-page edit and replans with the places already looked up. */
  function edit(change: (f: FormState) => FormState) {
    const next = change(form)
    setForm(next)
    if (resolved.current) setPlan(build(next, resolved.current.data))
  }

  const without = (list: string[], id: string) => list.filter((x) => x !== id)
  const editor: PlanEditor = {
    editing,
    edits,
    remove: (id) =>
      edit((f) =>
        id.startsWith('custom:')
          ? { ...f, customPlaces: f.customPlaces.filter((c) => customPlaceId(c.stopId, c.name) !== id) }
          : { ...f, excluded: [...without(f.excluded, id), id], included: without(f.included, id) },
      ),
    include: (id) => edit((f) => ({ ...f, included: [...without(f.included, id), id], excluded: without(f.excluded, id) })),
    restore: (id) => edit((f) => ({ ...f, excluded: without(f.excluded, id) })),
    move: (id, day) => edit((f) => ({ ...f, moves: { ...f.moves, [id]: day } })),
    addCustom: (stopId, name) =>
      edit((f) => ({ ...f, customPlaces: [...f.customPlaces.filter((c) => customPlaceId(c.stopId, c.name) !== customPlaceId(stopId, name)), { stopId, name }] })),
    saveDay: (d, title, summary) => setEdits((e) => ({ ...e, [d.day]: { title, summary, sig: daySignature(d) } })),
    resetDay: (day) =>
      setEdits((e) => {
        const next = { ...e }
        delete next[day]
        return next
      }),
  }

  return (
    <div ref={top} className="min-h-screen">
      <WeyvoBar />
      <main className={`mx-auto max-w-2xl px-4 ${EMBED.on ? 'pb-8 pt-4' : 'pb-16 pt-8 sm:pt-14'}`}>
        {!online && (
          <p role="status" className="mb-5 rounded-2xl border border-sun/50 bg-sun/15 px-4 py-3 text-sm leading-relaxed">
            <b>You're offline.</b> You can open your saved trips, or plan hand-checked places (like Lonavala, Manali or Goa) and places you've planned before. Search links need the internet.
          </p>
        )}
        {!EMBED.on && (
          <header className="relative mb-7 px-12 text-center">
            <SettingsMenu className="absolute right-0 top-0" />
            <h1 className="font-brand text-4xl leading-tight text-navy sm:text-5xl">BubDub's Atlas</h1>
            <ByWeyvo />
            {!plan && <p className="mt-2 text-sm text-muted">A practical day-by-day trip plan for anywhere, in a few seconds.</p>}
          </header>
        )}

        {plan ? (
          <PlanView
            plan={plan}
            loading={loading}
            editor={editor}
            onToggleEdit={() => setEditing(!editing)}
            shareUrl={() => shareLink({ form, edits })}
            weyvoUrl={() => weyvoStoryLink(plan, edits)}
            onEdit={() => {
              setEditing(false)
              setPlan(undefined)
            }}
            onExtend={(returnDate) => {
              const next = { ...form, returnDate, moves: {} }
              setForm(next)
              setEdits({})
              void makePlan(next)
            }}
            saved={!!savedId}
            saveFailed={saveFailed}
            onSave={() => {
              const id = newTripId()
              const ok = store(id)
              setSaveFailed(!ok)
              if (ok) setSavedId(id)
            }}
            onNew={() => {
              setSavedId(undefined)
              setSaveFailed(false)
              setForm(emptyForm())
              setEdits({})
              setEditing(false)
              setPlan(undefined)
            }}
          />
        ) : (
          <>
            {!EMBED.on && <InstallHint />}
            {loading && shared ? (
              <p className="rounded-3xl border border-line bg-white/70 p-6 text-center text-sm text-muted">Loading the shared trip…</p>
            ) : (
              <TripForm value={form} onChange={setForm} onSubmit={() => void makePlan()} loading={loading} />
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-2xl border border-clay/30 bg-clay/10 px-4 py-3 text-sm leading-relaxed text-ink">
                {error}
              </p>
            )}
            <SavedTrips onOpen={openSaved} />
            {!EMBED.on && <WeyvoInvite />}
            <p className="mt-6 text-center text-xs leading-relaxed text-muted">
              Places from © OpenStreetMap contributors and Wikipedia. Travel times and prices are rough estimates.
            </p>
          </>
        )}
      </main>
      {!EMBED.on && <footer className="border-t border-line py-6 text-center text-xs text-muted">
        © {YEAR} <a href={WEYVO_URL} className="font-semibold text-ink hover:underline">Weyvo</a>. BubDub's Atlas is Weyvo's trip planner. Somewhere starts here.
      </footer>}
    </div>
  )
}
