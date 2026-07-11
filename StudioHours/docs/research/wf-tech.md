# Time-Tracking Tool — Technical Architecture Recommendation

## A. Recommended Architecture

**Ship a statically-hosted, installable PWA as the primary product; the single self-contained HTML file is a secondary, clearly-labeled "offline power-user" export from the same codebase — not the primary distribution channel.**

**Why not lead with the double-click `.html` file:** research below confirms storage under `file://` is broken or fragile in 2 of the 4 target browsers:
- **Firefox** throws `SecurityError` and refuses **both** `localStorage` and `IndexedDB` under `file://` — this is a deliberate, still-open restriction (Bugzilla #643318, #1240349), not a bug that will get fixed.
- **Safari** throws the same `SecurityError` for `localStorage` under `file://` by default (well-documented WebKit behavior since Safari 11; still current). Given AIA members specifically complain about vendors lacking Mac support, Safari usage among architects is high — this alone rules out `file://` as the primary vehicle.
- **Chrome/Edge** do work under `file://`, but storage is keyed **per exact file path/URL**, not per app — MDN itself says this behavior is undefined/unguaranteed and "may vary." Rename, move, or re-download the file and the user's storage silently orphans.
- The File System Access API (the thing that would make `file://` safe against data loss) **requires a secure context (https/localhost) and is unavailable under `file://` entirely** — so even the one browser where storage works can't "save to a real file" from the offline build.

**Why the hosted PWA works cleanly:** a static host (GitHub Pages / Cloudflare Pages / Netlify) serves fixed files only — no server code, no database, no accounts — so it satisfies "no backend" exactly as much as double-clicking a file does; it just gives every browser a real `https` origin, which makes `localStorage`/`IndexedDB` behave identically and reliably everywhere, removes the per-path storage-key fragility, unlocks PWA install (which matters a lot for Safari's eviction policy — see B), and gives Chromium users the File System Access API for real "save to disk" backups.

**Same codebase, two build targets, no duplicated logic:**
| Target | Tool | Output | Audience |
|---|---|---|---|
| `build:web` | Vite + `vite-plugin-pwa` | hashed-asset bundle + manifest + service worker → deployed to a static host | primary: everyone, installable, offline-capable after first load |
| `build:offline` | same Vite project + `vite-plugin-singlefile` | one flat `index.html` with JS/CSS/small assets inlined | secondary: Chrome/Edge-only users who want a mail-able/USB-able file with zero hosting; ship it from a "Download offline copy" link on the hosted site, with an explicit in-app note that Safari/Firefox users should use the hosted version instead |

The manager dashboard is the same app/build, not a separate product — a route or view toggle (`?view=dashboard`) sharing all components, storage hooks, and the CSV/JSON parsers.

## B. Storage Decision + Eviction Risk

**Data size reality check (why this is an easy decision):** a time entry (`date, project, phase, hours, note`) is ~150–300 bytes as JSON. One person doing ~4–5 entries/day × ~250 working days/year × 5 years ≈ 5,000–6,000 entries ≈ **1–3 MB total**. A manager's dashboard importing 10 people's 5-year histories is still only ~10–30 MB. This is trivially small for either Web Storage or IndexedDB — the decision is about API ergonomics and safety margin, not capacity.

**Recommendation: IndexedDB as primary store, via a thin wrapper (`idb-keyval`, ~600B gz, or Dexie.js if you want schema/versioning help), with a tiny `localStorage` mirror only for settings/last-backup-timestamp.** Reasons: async (never blocks the week-grid UI on save), quota ceiling is GB-scale vs. Web Storage's ~5–10 MiB/origin cap (so the dashboard aggregating many staff-years never gets close to a wall), and it's the store that benefits from `navigator.storage.persist()` and PWA-install quota upgrades described below. A `localStorage`-only design would technically still fit the data volume, but gives up async writes and headroom for zero benefit given the developer already needs *some* persistence wrapper either way.

**Eviction risk per browser:**

| Browser | Default behavior | What triggers eviction | Mitigation |
|---|---|---|---|
| Chrome/Edge desktop | "Best-effort" storage bucket; LRU eviction only under severe disk pressure across origins | Disk nearly full + origin not recently used relative to others — essentially never happens at a 1–3MB footprint | Call `navigator.storage.persist()`; install as PWA (Chrome auto-upgrades installed/bookmarked/high-engagement origins toward persistent) |
| Firefox desktop | Same best-effort/LRU model, no time-based cap | Disk pressure only | `persist()` request; note Firefox has **no native desktop PWA install** (dropped Site-Specific-Browser support in 2021) — mobile Firefox still supports "Add to Home Screen" |
| Safari (macOS/iOS), **not installed** | **7-day script-writable storage cap** (ITP): if the user doesn't open a tab to the site in Safari for 7 consecutive days, ALL script-writable storage (localStorage, IndexedDB, Service Worker, etc.) is wiped | An employee on vacation/sick leave/using another browser habit for a week+ | **Install to Home Screen (iOS) / Dock (macOS Sonoma 14+/Safari 17+)** — installed apps get their own persistence counter that never ties to Safari's global tally, and get the same storage-quota tier as a full browser (up to 60% disk/origin as of Safari 17) |
| Safari, installed PWA | Exempt from the 7-day tally in practice; same quota tier as browser apps | Reportedly EU DMA browser-choice changes may complicate the exemption for EU iOS users — unconfirmed at reporting time | Still run scheduled export nags regardless (see C) — WebKit has also shipped real bugs that periodically wiped storage for *all* origins (bug #266559, fixed in 17.4), independent of ITP, which argues for defense-in-depth backups no matter what the eviction rules say |

## C. Backup/Restore + File System Access API (2026)

**Support matrix:**

| Capability | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| `showSaveFilePicker`/`showOpenFilePicker` (real file on disk) | Yes (v86+) | Yes (Chromium) | **No** — flagged as harmful in Mozilla's standards position, no plans | **No** — not committed, ships only OPFS since 15.2 |
| OPFS (sandboxed, not user-visible) | Yes | Yes | Yes | Yes (15.2+) |
| Requires secure context | Yes — **unavailable under `file://`**, https/localhost only | same | n/a | n/a |

Because OPFS isn't user-visible, it can't satisfy "hand a file to your manager" — it's irrelevant to this product's core workflow.

**Recommended pattern (works everywhere, upgrades gracefully on Chromium):**
1. IndexedDB is always the source of truth; nothing depends on the file-save step to function day-to-day.
2. On Chrome/Edge: let the user pick a backup file/folder **once** via `showSaveFilePicker`; persist the returned `FileSystemHandle` in IndexedDB; on later saves, call `handle.requestPermission()` (silently re-granted for the same origin) and write straight to that file — closest thing to "just saves like a native app," no repeated dialogs.
3. On Firefox/Safari (and as the universal fallback everywhere else): classic `Blob` + `<a download="firm-timesheet-2026-07.json">` triggers the normal Downloads/Save-As flow.
4. **Do not attempt silent/automatic scheduled downloads.** Chrome and Edge both actively block downloads that aren't tied to a direct, synchronous user gesture, and both ship an explicit admin/user setting to block "multiple automatic downloads" outright. Design the backup reminder as a **dismissible nag banner/badge** ("Last backup: 12 days ago — Back up now") driven by a timestamp stored in IndexedDB, requiring one real click — never a timer-fired download.
5. Restore = an "Import backup" file input / drop zone that reads the JSON and repopulates IndexedDB, with a merge-or-replace choice.

## D. Import (Manager Dashboard) & Export

**Multi-file drag-and-drop (no real gotchas, but a few things to get right):**
- `dataTransfer.files` is only populated on the `drop` event, not `dragover` — `preventDefault()` on both or the browser navigates away/opens the file instead of dropping it.
- Read files in parallel: `Promise.all(files.map(f => f.text()))` then `JSON.parse` each — at this data scale (tens of MB combined, worst case) there is no need for chunked/streaming reads.
- Filter by extension (`.json`) before parsing — a dragged **folder** instead of files, or OS cruft like `.DS_Store` from a whole-folder drag, will otherwise throw parse errors.
- Give every export a stable identity (`employeeId` + `exportedAt`) inside the JSON payload so the importer can de-dupe/replace-by-employee instead of blindly appending duplicate entries when the same person's file is dropped twice or a newer export supersedes an older one.
- Nice-to-have on Chrome/Edge only: `showOpenFilePicker({multiple:true})` as a picker alternative to drag-drop; keep drag-drop as the universal path since Firefox/Safari don't get the picker.

**Export (CSV/JSON via Blob):** works identically under `https` and under `file://` (Chromium) — Blob URLs are same-origin by construction, so the cross-origin download quirks that show up in older bug reports don't apply here. The one real-world rule to respect: **trigger the anchor click synchronously inside the click handler**, not after an `await`/`setTimeout` that lets user-activation expire — Safari in particular is strict about this.

**Print-friendly timesheet/invoice → PDF:** plain `@media print` CSS to hide chrome/buttons and lay out a clean grid, then the user does the browser's native Print → Save as PDF. No `file://` limitation here — `window.print()` from a button works identically everywhere, including the offline single-file build.

## E. Top 5 Technical Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Safari 7-day ITP eviction wipes an infrequent user's timesheet | Push PWA install hard (one prompt on first visit + persistent banner until installed); weekly backup nag as belt-and-suspenders regardless of install state |
| 2 | User "clears browsing data" and loses everything, on any browser | IndexedDB is not the only copy of truth for long: FSA-linked auto-save file (Chromium) + recurring one-click backup nag (all browsers) + explicit onboarding copy setting expectations |
| 3 | Someone insists on the double-click `.html` file as their only interface and it silently breaks on Firefox/Safari (`SecurityError`, no storage at all) | Ship it, but gate it behind explicit "Chrome/Edge only" messaging in-app and in any download link; detect the failure at runtime (`try{ localStorage.setItem(...) }catch{}`) and show a clear in-page error pointing to the hosted URL instead of silently losing data |
| 4 | Manager's dashboard import breaks on malformed/duplicate/old-schema JSON from staff running different app versions | Version every export payload (`schemaVersion`), validate on import (zod or manual), and design imports to be idempotent per `employeeId` |
| 5 | Downloads silently fail because a "backup" or "export" was fired from an async callback with expired user-activation | Keep all download-triggering code synchronous relative to the click; test explicitly in Safari, which enforces this most strictly |

## F. Sources

- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN — Window.localStorage (SecurityError on file:/data: origins)](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [Didomi — Apple adds a 7-Day Cap on All Script-Writable Storage](https://support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage)
- [WebKit blog — Updates to Storage Policy (Safari 17 quotas, installed-app exemption)](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit Bugzilla #266559 — Safari periodically erasing LocalStorage/IndexedDB for all sites (fixed 17.4)](https://bugs.webkit.org/show_bug.cgi?id=266559)
- [Search Engine Land — What Safari's 7-day cap means for PWA developers](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519)
- [Mozilla Bugzilla #643318 — IndexedDB blocked for webpages running locally](https://bugzilla.mozilla.org/show_bug.cgi?id=643318)
- [Mozilla Bugzilla #1240349 — IndexedDB "operation is insecure" on file://](https://bugzilla.mozilla.org/show_bug.cgi?id=1240349)
- [xjavascript.com — Why localStorage in Firefox only works online, not via file://](https://www.xjavascript.com/blog/does-localstorage-in-firefox-only-work-when-the-page-is-online/)
- [sketchytech — Local Storage: how to debug it and why Safari throws SecurityError](https://sketchytech.blogspot.com/2018/08/local-storage-how-to-debug-it-and-why.html)
- [Apple Developer Forums — Safari SecurityError on localStorage](https://forums.developer.apple.com/thread/87778)
- [dev.to — Is there IndexedDB or localStorage for localhost/file:// protocol?](https://dev.to/patarapolw/is-there-indexeddb-or-localstorage-for-localhost-or-local-file-protocol-3fp3)
- [caniuse — File System Access API browser support](https://caniuse.com/native-filesystem-api)
- [Chrome for Developers — The File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [MDN — File System API (secure-context requirement)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [MDN — Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [i-programmer — Firefox drops support for PWA/Site-Specific-Browser](https://www.i-programmer.info/news/87-web-development/14261-firefox-drops-support-for-pwa.html)
- [MDN — Installing and uninstalling web apps (PWA)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing)
- [vite-plugin-singlefile (npm)](https://www.npmjs.com/package/vite-plugin-singlefile) / [GitHub](https://github.com/richardtallent/vite-plugin-singlefile)
- [Google Chrome Help — downloads blocked / warnings](https://support.google.com/chrome/answer/6261569?hl=en)
- [Microsoft Learn — Edge `AutomaticDownloadsBlockedForUrls` policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/automaticdownloadsblockedforurls)
- [jscrip/clientside-drag-drop-json-file-parser — drag-drop JSON parsing pattern](https://github.com/jscrip/clientside-drag-drop-json-file-parser)

**Files/artifacts:** none created — this task was pure research (WebSearch/WebFetch only); no code, config, or plan file was written, consistent with plan-mode restricting edits to read-only actions for a task that required none.