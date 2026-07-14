# Architecture firm apps — StudioCRM, StudioHours & StudioLog

Three local-first apps for running a small architecture firm. All three run entirely in your web browser on your own computer — no accounts, no cloud, no subscription, and they keep working with no internet.

## Which app is which

| App | Job | Daily use |
|---|---|---|
| **StudioCRM** | Winning the work | Clients, contacts, opportunity pipeline, follow-ups |
| **StudioHours** | Time → billing → people | Log hours, send invoices, pay staff, track who owes you |
| **StudioLog** | Delivering the work | Deadlines, drawing register, RFIs, site & meeting notes |

They're three stages of a longer pipeline for a solo firm. **StudioCRM** covers the "win work" stage — clients, contacts, an opportunity pipeline, and follow-ups, right up until a lead turns into a won job. From there, **ArchOS** (not in this repo) is where you price and win the job itself, and its numbers carry into **StudioHours** by typing in a few numbers once. Further downstream, StudioHours can also export sent invoices for **StudioPay** (a "getting paid" companion app, also not in this repo) via a one-file export.

StudioCRM plugs into StudioHours/StudioLog the same way, in spirit, but by hand: its Clients screen can export a one-file `clients-for-studio` hand-off listing every *won* client's name and primary contact (nothing else — no pipeline history, no fees, no notes), and you copy that into StudioHours/StudioLog yourself when you set the project up there. It's manual and one-way on purpose: StudioCRM never reads StudioHours/StudioLog's data, and StudioHours/StudioLog never read StudioCRM's — no shared database, no import screen, nothing to keep in sync.

The apps don't share a server, on purpose — fewer moving parts, nothing to sync or break.

## Fastest way to try them (no installing anything)

Open the **`Ready to open (offline)`** folder in this repo and double-click any of these files:

- `studio-crm-offline.html`
- `studio-hours-offline.html`
- `studio-log-offline.html`

Each is the *entire* app in one file — it opens in your browser and just works, even offline. Bookmark it. To use an app on another computer, copy its one HTML file over.

> ⚠️ **Where your data lives:** inside the browser on that computer — *not* in the HTML file. So always use the same browser on the same computer, and use each app's **Settings → Back up** regularly. The backup file is both your safety net and how you move your data to another computer.

## Changing or rebuilding the apps (for a developer)

Each app is a normal React + Vite project in its own folder (`StudioCRM/`, `StudioHours/`, `StudioLog/`). You need [Node.js](https://nodejs.org) 18+. Inside any of them:

```bash
npm install     # first time only
npm run dev      # live editing preview
npm run build    # rebuilds everything, including the single-file offline HTML in dist/
```

Each app folder has its own README with the details.

## What's in this repo

```
README.md                     ← this file
Ready to open (offline)/      ← double-click-and-go HTML files (StudioCRM, StudioHours, StudioLog)
StudioCRM/                    ← full source (no node_modules — run "npm install" to rebuild)
StudioHours/                  ← full source (no node_modules — run "npm install" to rebuild)
StudioLog/                    ← full source (no node_modules — run "npm install" to rebuild)
```
