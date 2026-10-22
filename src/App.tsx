import { useEffect, useRef, useState } from 'react'
import { customPlaceId, daySignature, planTrip, type DayEdit, type TripPlan } from './engine'
import { resolveTrip, type LiveResolved } from './live'
import { emptyForm, loadForm, pickedPlaces, readShareLink, saveForm, shareLink, toInput, type FormState } from './ui/form'
import { PlanView, type PlanEditor } from './ui/PlanView'
import { TripForm } from './ui/TripForm'

const shared = readShareLink(location.hash)
const YEAR = new Date().getFullYear()

/** Which lookups a form needs: replanning without a new lookup is instant. */
const placesKey = (f: FormState) => JSON.stringify([f.from.name.trim(), f.stops.map((s) => s.name.trim()), pickedPlaces(f)])

export default function App() {
  const [form, setForm] = useState<FormState>(() => shared?.form ?? loadForm() ?? emptyForm())
  const [plan, setPlan] = useState<TripPlan>()
  const [edits, setEdits] = useState<Record<number, DayEdit>>(() => shared?.edits ?? {})
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(!!shared)
  const resolved = useRef<{ key: string; data: LiveResolved }>(undefined)
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => saveForm(form), [form])

  function build(f: FormState, data: LiveResolved): TripPlan {
    const p = planTrip(toInput(f), data)
    p.warnings.unshift(...data.notices)
    return p
  }

  async function makePlan(f: FormState = form) {
    setLoading(true)
    setError(undefined)
    try {
      const key = placesKey(f)
      if (resolved.current?.key !== key) {
        resolved.current = { key, data: await resolveTrip(toInput(f), pickedPlaces(f)) }
      }
      setPlan(build(f, resolved.current.data))
      top.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:pt-14">
        <header className="mb-7 text-center">
          <h1 className="font-brand text-4xl leading-tight text-navy sm:text-5xl">BubDub's Atlas</h1>
          {!plan && <p className="mt-2 text-sm text-muted">A practical day-by-day trip plan for anywhere, in a few seconds.</p>}
        </header>

        {plan ? (
          <PlanView
            plan={plan}
            loading={loading}
            editor={editor}
            onToggleEdit={() => setEditing(!editing)}
            shareUrl={() => shareLink({ form, edits })}
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
            onNew={() => {
              setForm(emptyForm())
              setEdits({})
              setEditing(false)
              setPlan(undefined)
            }}
          />
        ) : (
          <>
            {loading && shared ? (
              <p className="rounded-3xl border border-line bg-white/70 p-6 text-center text-sm text-muted">Loading the shared trip…</p>
            ) : (
              <TripForm value={form} onChange={setForm} onSubmit={() => void makePlan()} loading={loading} />
            )}
            {error && <p className="mt-4 rounded-2xl bg-clay/10 px-4 py-3 text-sm text-clay">Something went wrong: {error}</p>}
            <p className="mt-6 text-center text-xs leading-relaxed text-muted">
              Places come from OpenStreetMap and Wikipedia, with hand-checked notes for popular spots. Travel times are rough estimates.
            </p>
          </>
        )}
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        © {YEAR} Maheeesh. Somewhere starts here.
      </footer>
    </div>
  )
}
