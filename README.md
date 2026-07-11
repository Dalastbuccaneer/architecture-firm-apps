# Architecture firm apps — StudioHours & StudioLog

Two local-first apps for running a small architecture firm. Both run entirely in your web browser on your own computer — no accounts, no cloud, no subscription, and they keep working with no internet.

## Which app is which

| App | Job | Daily use |
|---|---|---|
| **StudioHours** | Time → billing → people | Log hours, send invoices, pay staff, track who owes you |
| **StudioLog** | Delivering the work | Deadlines, drawing register, RFIs, site & meeting notes |

They're two halves of a three-app setup for a solo firm — the third, **ArchOS** (not in this zip), is where you price and win the job. You carry a project from ArchOS into these two by typing in a few numbers once; the apps don't share a server on purpose (fewer moving parts, nothing to sync or break).

## Fastest way to try them (no installing anything)

Open the **`Ready to open (offline)`** folder in this zip and double-click either file:

- `studio-hours-offline.html`
- `studio-log-offline.html`

Each is the *entire* app in one file — it opens in your browser and just works, even offline. Bookmark it. To use an app on another computer, copy its one HTML file over.

> ⚠️ **Where your data lives:** inside the browser on that computer — *not* in the HTML file. So always use the same browser on the same computer, and use each app's **Settings → Back up** regularly. The backup file is both your safety net and how you move your data to another computer.

## Changing or rebuilding the apps (for a developer)

Each app is a normal React + Vite project in its own folder (`StudioHours/`, `StudioLog/`). You need [Node.js](https://nodejs.org) 18+. Inside either folder:

```bash
npm install     # first time only
npm run dev      # live editing preview
npm run build    # rebuilds everything, including the single-file offline HTML in dist/
```

Each app folder has its own README with the details.

## What's in this zip

```
README.md                     ← this file
Ready to open (offline)/      ← the two double-click-and-go HTML files
StudioHours/                  ← full source (no node_modules — run "npm install" to rebuild)
StudioLog/                    ← full source (no node_modules — run "npm install" to rebuild)
```
