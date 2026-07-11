# StudioLog — project delivery

The "run the work" app for a small architecture firm: deadlines, drawings, correspondence, and site notes. Local-first: everything lives in your browser on your own device. No accounts, no cloud, no monthly fee. Works offline — including on your phone on site.

## What it does

- **Today** — the Monday-morning screen. One glance shows stage deadlines coming up, overdue RFIs and approvals, tasks due, and open follow-ups from your notes. Tick a task done right here.
- **Projects** — each project has:
  - **Overview** — stages on a visual timeline (one-click RIBA/AIA templates), plus links to your drawing folders (Drive/Dropbox — StudioLog stores the *link*, not the files).
  - **Drawings** — a drawing register: number, title, revision, status. "Issue" bumps the revision and records what it was issued for; export the register as a spreadsheet to use as a transmittal.
  - **Log** — RFIs, submittals, approvals, instructions, decisions. Overdue items are flagged in plain words; mark them answered in one tap.
  - **Notes** — meeting and site-visit notes with follow-up checklists (built to write on your phone during a visit).
  - **Tasks** and **Contacts** — per project.
- **Settings** — back up / restore everything.

## The easy way to use it (no installing anything)

After it's been built once (see below), there is a single file:

```
dist/studio-log-offline.html
```

**Double-click that file** — it opens in your web browser and the whole app runs from that one file, even with no internet. On a phone, open that file in the browser and "Add to Home Screen" to use it like a normal app on site.

> ⚠️ Your data is saved **inside the browser on that device**. It is not in the HTML file itself. Use the **same browser on the same device**, and use **Settings → Back up** regularly (it saves a file you can restore later or move to another device).

## The developer way (to change it or rebuild it)

You need [Node.js](https://nodejs.org) 18 or newer installed. Then, in this folder:

```bash
npm install        # first time only
npm run dev        # live preview at http://localhost:5174 while editing
npm run build      # produces dist/ including studio-log-offline.html
npm run preview    # serve the built app at http://localhost:4174
```

## How it fits with the other apps

This is the delivery end of a three-app setup for running a solo firm:

1. **ArchOS** (separate) — price and win the job.
2. **StudioHours** (separate) — log time, invoice, pay people.
3. **StudioLog** (this app) — deadlines, drawings, RFIs, site notes.

The apps deliberately don't share a server — you set a project up in each once, by hand. Fewer moving parts, nothing to sync or break.

## Good to know

- **Local-first & private** — no sign-in, nothing uploaded.
- **Back up** from Settings; that file is your safety net and your way to move between devices.
- File links only — StudioLog never stores your actual drawings/photos, just links to where they live.
- Built with React + Vite + Dexie (IndexedDB). Tests: `node test-deadlines.mjs` and `node e2e-smoke.mjs`.
