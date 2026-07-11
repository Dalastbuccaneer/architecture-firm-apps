# StudioHours — time, billing & people

The "get paid & run the team" app for a small architecture firm. Local-first: everything lives in your browser on your own device. No accounts, no cloud, no monthly fee.

## What it does

- **Week** — log hours on a simple weekly grid (this is the daily 2-minute job). Staff each run their own copy and send you a file; you drag it in.
- **Money** — turn logged hours into invoices two ways: **bill by the hour**, or **bill a percentage of the fee** (stage claims). Plus an **Expenses** ledger you can add onto invoices, and a **"Waiting to be paid"** strip that shows who owes you and how old it is.
- **Dashboard → Fee Burn** — for any project: hours spent vs. budget, per stage, with how much of the fee you've invoiced. (Type the stage budgets in from your pricing tool once, and this fills itself in from the timesheets.)
- **People** — salaries and monthly payslips, leave balances, end-of-service savings, and a renewals reminder list (insurance, licenses, visas, subscriptions). *This data never leaves your device and is never in the file you share with staff.*
- **Setup** — projects, stages (with one-click RIBA/AIA templates), billing rates, activities, and the firm file you hand to staff.

## The easy way to use it (no installing anything)

After it's been built once (see below), there is a single file:

```
dist/studio-hours-offline.html
```

**Double-click that file** — it opens in your web browser and the whole app runs from that one file, even with no internet. Bookmark it. To use it on another computer, copy that one file over.

> ⚠️ Your data is saved **inside the browser on that computer**. It is not in the HTML file itself. So: use the **same browser on the same computer**, and use **Settings → Back up** regularly (it saves a file you can restore later or move to another machine).

## The developer way (to change it or rebuild it)

You need [Node.js](https://nodejs.org) 18 or newer installed. Then, in this folder:

```bash
npm install        # first time only — downloads the building blocks
npm run dev        # live preview at http://localhost:5173 while editing
npm run build      # produces dist/ including studio-hours-offline.html
npm run preview    # serve the built app at http://localhost:4173
```

`npm run build` creates both a normal website build (`dist/`) and the single-file `dist/studio-hours-offline.html`.

## How it fits with the other apps

This is the middle of a three-app setup for running a solo firm:

1. **ArchOS** (separate) — price the job, write the proposal, win it.
2. **StudioHours** (this app) — type the won project in (stages + budgets, ~3 min), then log time, bill, pay people.
3. **StudioLog** (separate) — run the delivery: deadlines, drawing register, RFIs, site notes.

The apps don't talk to a shared server — you carry a couple of numbers between them by hand, on purpose (fewer moving parts, nothing to break or sync).

## Good to know

- **Local-first & private** — no sign-in, nothing uploaded. Everything is on your machine.
- **Back up** from Settings; that file is your safety net and your way to move between computers.
- Built with React + Vite + Dexie (IndexedDB). Tests: `node test-claims.mjs`, `node test-people.mjs`, `node test-expenses.mjs`, and `node e2e-smoke.mjs` (browser walkthrough).
