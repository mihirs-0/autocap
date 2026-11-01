# Meal Planner (iPhone PWA)

Plan meals, photograph what you eat, and copy or export the details for an LLM.
Everything is stored on your phone. There is no server, account, or tracking.

## Important: your data lives only on your phone

- Meals and photos are in the browser's local database (IndexedDB) on the device.
- **If you clear Safari's website data, delete the Home Screen app, or iOS removes
  website data to free space, your records are erased.** There is no cloud copy.
- Use **Data → Create backup** now and then, and save the file in Files or iCloud Drive.
- Safari can delete data of websites you have not opened for 7 days. Apps added to
  the Home Screen are not affected by this rule, so install the app (steps below).

## Setup

You need Node.js 20 or newer.

```bash
cd meal-planner
npm install
npm run dev        # development server at http://localhost:5173 (no offline mode in dev)
npm test           # unit tests (export text, ZIP, database, backup)
npm run build      # production build into dist/ (includes the service worker)
npm run preview    # serve dist/ at http://localhost:4173
npm run e2e        # full browser test of the built app (needs Playwright + Chromium)
```

To test on your iPhone on the same Wi-Fi: `npm run build && npm run preview`, then open
`http://<your-computer-IP>:4173`. Offline mode and "Add to Home Screen" with offline
support need HTTPS, so for real use, host it (next section).

## HTTPS hosting

The app is a folder of static files (`dist/`). Any static host with HTTPS works. All
paths are relative, so it also works in a sub-folder (for example GitHub Pages).
These options are free for this size of site:

- **GitHub Pages** (set up in this repo): the workflow
  `.github/workflows/meal-planner-pages.yml` runs the tests, builds the app, and pushes
  `dist/` to the `gh-pages` branch on every change to `meal-planner/`.
  One-time step: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
  Branch: `gh-pages`, folder `/ (root)` → Save**. The app is then at
  `https://mihirs-0.github.io/autocap/`.
- **Netlify** or **Cloudflare Pages**: build command `npm run build`, base directory
  `meal-planner`, publish directory `dist`.
- **Your own server** (Caddy, nginx): copy `dist/` to the web root. HTTPS is required.

One host setting matters: `sw.js` must not be cached for a long time, or updates reach
the phone slowly. Most hosts do this correctly by default. If you set caching rules,
give `sw.js` and `index.html` `Cache-Control: no-cache`. Files in `assets/` have a hash
in their names and can be cached for a long time.

Remember: the site is public at its URL, but your meal data never leaves your phone.

## Add to your iPhone Home Screen

1. Open the HTTPS address of the app in **Safari**.
2. Wait until the page has loaded fully (this stores the app for offline use).
3. Tap the **Share** button (square with an arrow).
4. Scroll down and tap **Add to Home Screen**. Make sure "Open as Web App" is on (iOS 26).
5. Tap **Add**. Open the app from the new "Meals" icon.

Note: data in the Home Screen app is separate from data in the Safari tab. Use the
Home Screen app for your records.

When a new version is published, the app shows "A new version of the app is ready".
Tap **Update**. Your data is not touched by updates.

## How to use it

- **Day**: breakfast, lunch, dinner and snacks. Tap "+ Add" to plan a meal or log what
  you ate. Only the name is required.
- **Plan and actual food are kept apart.** In a meal, the "Planned" and "What I ate" tabs
  are two separate records. "Ate as planned" makes a copy of the plan; the plan stays.
- **Photos**: "Camera" or "Library" in a meal. Photos are reduced to 1600 px on the long
  side (JPEG, about 200–500 KB), which keeps food details visible. Tap a thumbnail to enlarge.
- **Favorites**: "Save as favorite" in a meal; reuse it from "+ Add".
- **Copy a day**: "Copy this day's plan to another day" (copies are plans; photos are not copied).
- **Photos tab**: all photos by month and date.
- **Export**:
  - *Copy for LLM*: plain text for one meal (open the meal → "Save and copy for LLM"),
    a day, or a date range (Export tab). **Copied text does not contain photos.**
  - *Export with photos*: a ZIP with `meal-log.md` and a `photos/` folder. Each photo file
    name is written beside its meal. On iPhone, "Share or save ZIP…" opens the share sheet
    (Save to Files, or send to an app). Unzip in Files, then upload the files to your LLM.
  - Optional instruction: "Estimate calories for the recorded food actually eaten…"
- **Data**: full JSON backup (with photos), restore (merge or replace), favorites, storage use.

## How it is built

- React + TypeScript, built with Vite. No runtime libraries other than React.
- `src/db.ts`: IndexedDB. Each save is one transaction: it saves fully or changes nothing.
  Storage errors (for example "storage full") show a message, and the editor stays open
  with what you typed.
- `src/exportText.ts`: text and Markdown export. `src/zip.ts`: small ZIP writer.
- `src/backup.ts`: backup and restore. `src/photos.ts`: photo compression.
- `sw/sw.js`: service worker. The build fills in the file list (`vite.config.ts`).
- Calorie estimation is not in the app. There is no AI, API key, or network use.
