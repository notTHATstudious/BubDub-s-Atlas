# Trip Planner

A minimal web app that turns a rough travel idea ("Mumbai to Spiti, six days, budget") into a practical, shareable plan: nearby places, a day-wise itinerary, and the going and return journeys.

No backend, no AI, no sign-up. It's a static site.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # planner and parser tests
npm run demo     # prints a few sample plans in the terminal
npm run build    # production build into dist/
```

## Where the place data comes from

The app uses a **hybrid** of two sources:

1. **Curated list** (`src/data/destinations.ts`): popular destinations such as Lonavala, Manali, Kasol, Spiti, Goa, Udaipur and Munnar, checked by hand. Each has nearby places grouped into outings, rough travel times, seasonal notes, closures (Rohtang in winter, rafting in monsoon) and access routes (Spiti is reached via Manali in summer, or via Shimla and Kinnaur with a halt).
2. **Live open data, for anywhere else** (`src/live/`), called straight from the browser:
   - [Photon](https://photon.komoot.io) (OpenStreetMap geocoding) finds the place.
   - [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) lists nearby attractions, the nearest airport and the nearest station. Places with a Wikipedia or Wikidata link rank higher.
   - [Wikipedia geosearch](https://www.mediawiki.org/wiki/API:Geosearch) fills in when OpenStreetMap has little.
   - [Open-Meteo elevation](https://open-meteo.com/en/docs/elevation-api) feeds the high-altitude rule.

   These services are free, need no API key, and ask for fair use. Responses are cached in the browser for a week.

Travel times are **rough distance-based estimates**. They're only used to plan how much of the first and last day you can use, and the app never shows them as schedules or prices.

## How planning works

`src/engine/planner.ts` is a pure function: `planTrip(input, resolvedPlaces) → plan`.

- **Arrival and return:** it estimates the journey for your travel style (Budget prefers train or bus, Premium prefers flights or a cab), works out when you arrive, and keeps the first day light after a long or overnight journey. The **return date is the day you leave for home**, and the last day only has time before you leave.
- **Stops and nights:** each stop gets its minimum nights first, then nights towards its ideal. If the dates are too short, later stops are dropped with a warning, and it suggests closer alternatives or says how many days the route needs.
- **Gateways:** destinations reachable only by road through another place (Spiti via Manali) get that place added as a transit night, with en-route sights such as Chandratal.
- **Places:** nearby places are grouped into outings and packed into days with an 8-hour sightseeing budget (4 hours on light days), at most 4 places a day. Highlights and your interests rank higher, similar places lose value as they repeat, and anything closed that month is left out.
- **Altitude:** above about 3,000 m, the arrival day is kept for rest and the next day is shortened.
- **Season:** seasonal notes and "usually best in…" hints come from the curated data.

## Transport and budget

Live flight and train schedules and fares need paid APIs (and a server to keep the key secret), so the app doesn't fetch them. Instead, for the going and return journeys it:

- compares flight, train, bus and road using the real nearest airport and railhead, with rough door-to-door times and fare ranges;
- suggests one option for your travel style, and times the days around it;
- links each option to a pre-filled search on Google Flights, Skyscanner, IRCTC, redBus, Google Maps or Rome2Rio, where you see actual times and prices.

The budget (`src/engine/budget.ts`) adds up transport, stays, food, local travel and entry fees from typical Indian prices for the chosen style, shown as a range. Food counts partial days on travel days, local travel is priced by the actual outing distance, and entry fees by the kind of place (temples free, ASI monuments ₹25–40). The basis is noted in the file and on the page.

If you prefer a transport mode (Train, Bus, Flight, Road), the plan uses it wherever it works. When it doesn't, the plan says why (for example, too far for a bus or too close to fly) and what it used instead.

## Offline

With no connection, the app shows an offline notice and only plans the hand-checked destinations, labelled as planned offline. Any other place is refused with a clear message instead of an empty, made-up plan. The form starts blank each time the app is opened (it's kept only for the current visit).

## Editing and sharing

- **Edit plan** on the plan page lets you remove places (and undo), move a place to another day of the same stop, add suggested places or your own, and rewrite any day's text. The plan updates instantly, without new lookups.
- **Copy plan** copies a clean plain-text version (upper-case headings, no markdown) that reads well in WhatsApp. Transport and the itinerary each also have their own Copy button.
- **Share on WhatsApp** opens WhatsApp with the plan filled in.
- **Copy link** makes a read-only link that carries the whole trip in the URL, so no server is needed. Opening it plans the same trip again.

## Install as an app (PWA)

The site is an installable web app: `public/manifest.webmanifest` (name, colours, icons), icons in `public/icons/` (normal and maskable, 192 and 512 px), and a small service worker in `public/sw.js`, registered only in production builds. To make an Android app, run the deployed URL through [PWABuilder](https://www.pwabuilder.com) and download the Android package.

## Project layout

```
src/
  data/       curated destinations, starting cities, shared types
  engine/     planner (pure, no network), journey estimates, dates, geo helpers
  live/       OpenStreetMap / Wikipedia / Open-Meteo lookups and parsers
  ui/         trip form, place autocomplete, plan page
  App.tsx     switches between the form and the plan
scripts/demo.ts
```

## Deploy on Render (free static site)

1. Push this folder to a GitHub repository.
2. On [Render](https://render.com), choose **New → Static Site** and pick the repository.
3. Use these settings:
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `dist`
   - **Node version:** set an environment variable `NODE_VERSION=22`
4. Deploy. Each push to the main branch redeploys automatically.

The app has a single page, so it doesn't need rewrite rules yet.
