import { planTrip, resolveCurated, type TripInput } from '../src/engine'
const cases: TripInput[] = [
  { from: 'Mumbai', stops: ['Manali'], departDate: '2026-12-24', returnDate: '2026-12-28', departTime: '21:00', style: 'budget' },
  { from: 'Mumbai', stops: ['Spiti'], departDate: '2027-07-10', returnDate: '2027-07-15', style: 'budget' },
  { from: 'Mumbai', stops: ['Spiti'], departDate: '2027-07-10', returnDate: '2027-07-20', style: 'balanced' },
  { from: 'Mumbai', stops: ['Lonavala'], departDate: '2027-07-10', returnDate: '2027-07-11' },
  { from: 'Mumbai', stops: ['Lonavala'], departDate: '2027-07-10', returnDate: '2027-07-10' },
  { from: 'Mumbai', stops: ['Manali', 'Kasol'], departDate: '2027-04-10', returnDate: '2027-04-17', style: 'balanced', interests: ['trekking','cafes'] },
  { from: 'Bengaluru', stops: ['Hampi'], departDate: '2027-01-10', returnDate: '2027-01-12' },
]
for (const c of cases) {
  const p = planTrip(c, resolveCurated(c))
  console.log('\n=====', p.title, p.startDate, '→', p.endDate, `${p.totalDays}d`, p.route.map(r=>`${r.name}${r.transit?'(t)':''}:${r.nights}`).join(' '))
  console.log('OUT', p.outbound.estimate?.mode, p.outbound.estimate?.hours, p.outbound.departHour, p.outbound.arrival, '| IN', p.inbound.estimate?.mode, p.inbound.estimate?.hours, p.inbound.arrival)
  for (const d of p.days) {
    console.log(`DAY ${d.day} ${d.date} [${d.type} cap ${d.capacityHours}] ${d.title.toUpperCase()}\n   ${d.summary}`)
    for (const n of d.notes) console.log('   · ' + n)
    if (d.optional.length) console.log('   + optional: ' + d.optional.map(o=>o.name).join(', '))
  }
  for (const w of p.warnings) console.log(`! ${w.level}: ${w.text}`)
  for (const s of p.suggestions) console.log(`? ${s}`)
}
