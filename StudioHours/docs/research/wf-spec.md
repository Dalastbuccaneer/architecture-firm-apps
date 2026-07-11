# Time Tracker for Small Architecture Firms — V1 Product Spec

*Working name: "the tool" (see Open Question 3 for naming). Scope: free, local-first, no accounts, no backend. Audience: 1–10 person architecture firms who just got burned by Harvest's usage-based repricing.*

---

## 1. Personas + Weekly Flows

### Persona A — Priya, Project Architect (staff, 4 years experience)

Priya works on three active projects spread across SD, CD, and CA phases, plus the odd internal meeting. She opens the app Monday morning — it's a bookmarked PWA on her office laptop — and the week grid is already sitting there with last week's rows copied forward (same three project/phase rows, zeroed hours), because she's doing the same kind of work again this week. Through the week she logs time in short bursts: Tuesday afternoon she types `3.5` into the CD/Drafting cell after a long Revit session; Thursday she remembers a client called with a change she didn't ask for, so she logs `1.5` under Client Meeting, checks "Additional Services / Out of Scope," and types "Client requested added skylight — verbal request, will confirm in writing" in the requested-by field. Friday at 4pm, because she's honest with herself, she reconstructs the rest of the week from her calendar and email — the grid doesn't punish her for this, there's no timer she forgot to stop. She glances at the weekly total bar (34.5 / 40h), fills the last few hours into an Admin catch-all row, and hits Export. A file downloads; she drags it into the firm's shared "Timesheets" folder in OneDrive, the same folder everyone already uses for consultant sets.

### Persona B — Dave, Managing Principal (5-person firm, also does billable work)

Dave doesn't run a separate PM tool — he's the de facto office manager on top of doing his own design work. Monday morning he opens the same app, switches to Dashboard view, and drags the whole week's folder of five JSON files onto the import zone. The app tells him: 5 files read, 5 people updated, 1 replaced a partial import from Friday (someone re-exported after fixing an entry). He scans the Alerts panel: the CD phase on the Miller Residence is at 88% of budgeted hours with the team's own estimate putting the phase at maybe 60% done — the exact "end-of-phase surprise" he used to only discover at invoicing time. He clicks into the project, sees Priya's flagged out-of-scope skylight hours sitting at 6 hours across two weeks — enough to justify an additional-services email to the client, with the paper trail already written by Priya, not reconstructed by him. He checks firm-wide utilization (74%, healthy), notices one junior staffer's non-billable admin hours are creeping, and exports a rollup CSV to hand to the bookkeeper for the QuickBooks entry. Total time spent: eleven minutes, once a week.

---

## 2. Screens

### 2.1 Onboarding / First-Run

- Single-screen welcome: "No signup. No cloud. Your data stays on this computer." Two buttons: **Start as a person logging time** / **Set up the firm** (same app, no gate — either path works, firm setup can be done later).
- Quick firm-setup wizard (skippable, defaults pre-filled): firm name, add people (name only, no email/password required), confirm phase template (AIA 6-phase default, RIBA 8-stage alternate, or blank/custom), confirm default weekly capacity (40h).
- Ends with an explicit **"Install this app"** prompt (PWA add-to-home-screen / install banner), with copy explaining *why* (Safari/browser storage can get cleared if you never revisit the tab — installing fixes that). Dismissible but reappears weekly until installed.
- Small note offering the offline single-file `.html` download, labeled "Chrome/Edge only, advanced" — not the default path.

### 2.2 Week Timesheet Grid (staff home screen)

- Table: rows = Project + Phase (e.g., "Miller Residence — CD"), columns = Mon–Sun + row total. Standing rows for PTO/Vacation/Sick/Holiday and Admin/Firm Internal are always pinned at the bottom, always visible, no lookup needed.
- Each cell: click to type hours directly (tab-through like a spreadsheet). Selecting a cell reveals an optional secondary row for Activity (dropdown, nested under the phase), Notes, and two checkboxes: **Billable** (defaults from phase/project setting) and **Out of Scope / Additional Services** → reveals a "Requested by" text field when checked.
- Notes field is *not* required by default; the UI nudges/soft-requires it only when: hours on a single cell exceed a threshold (e.g. 6h), the entry is non-billable, or Out of Scope is checked.
- Top of screen: **"Copy Last Week"** button (duplicates row structure with zeroed hours) and week-picker (prev/next week arrows).
- Footer: running weekly total vs. capacity target as a progress bar (e.g., "34.5 / 40h"), and a same-shaped column of daily totals to eyeball a 0-hour day.
- A lightweight **"Log this now"** quick-add button/floating action, optimized for a phone screen, for on-site logging right after a site visit — same grid, filtered to today only.
- Primary actions: enter hours, copy last week, flag out-of-scope, export (deep link to My Reports).

### 2.3 Projects & Phases Setup

- List of projects (client name, project number, project name, status: active/on hold/closed, billing method: fixed fee / hourly / % construction cost, fee amount if fixed).
- Expand a project to manage its phases: name, AIA code (SD/DD/CD/Bid/CA/Closeout, reorderable, add/remove), budgeted hours per phase, budgeted fee per phase (optional), billable-by-default toggle.
- Separate section for the four pre-seeded non-project buckets (Marketing/BD, Firm Admin, PTO, Professional Development) — editable but present from day one so nobody hits an empty picker.
- Separate section for the Activity list (Design, Drafting, Client Meeting, Client-Requested Revision, Consultant Coordination, Site Visit, Research/Code Review, Specifications, Renderings, Permitting, RFI Response, Submittal Review, Punch List, + non-billable activities) — pre-seeded, renamable, archivable, not deletable if in use.
- Primary actions: add/archive project, add/edit phase + budget, edit activity list.

### 2.4 My Reports / Export (personal view)

- Date-range picker (this week / this month / custom).
- Personal summary: hours by project, billable vs non-billable split, own utilization %, hours by activity.
- **Export** button: choose JSON (round-trip/import format) or CSV (Excel/QuickBooks-friendly); filename auto-generated (`firmname_employeename_2026-W27.json`).
- **Print-friendly timesheet view**: clean grid layout via `@media print`, no chrome/buttons — mirrors the paper/Excel timesheet staff already trust, usable as a physical or PDF record for approval/files.
- Primary actions: filter date range, export, print.

### 2.5 Manager Dashboard (import + metrics)

- Large drag-and-drop zone at top: "Drop timesheet files or a whole folder here" (+ file-picker button, multi-select, Chromium-only convenience).
- **Import log** panel: table of every import — file name, employee, date range covered, entry count, imported timestamp, status (new / replaced N entries / error — malformed row).
- Tabs: **Overview** (firm utilization, active alerts), **By Project** (phase burn bars vs. budget, out-of-scope hours running total), **By Person** (utilization, non-billable breakdown), **Alerts** (phase burn >85%, utilization outliers, stale/missing submissions).
- Export rollup button (CSV) for handoff to bookkeeping/accounting.
- Primary actions: import (drag-drop), drill into a project/person, export rollup.

### 2.6 Settings & Backup

- Last-backup timestamp + dismissible nag banner ("Last backup: 12 days ago — Back up now").
- **Back up now** (Blob download everywhere; on Chrome/Edge, one-time `showSaveFilePicker` link to a real file that gets rewritten silently thereafter).
- **Import backup / Restore** (file input + drag-drop), with merge-or-replace choice.
- PWA install status/instructions (per-browser: iOS Home Screen, macOS Dock, Chrome/Edge install icon; explicit note that Firefox has no desktop install, use the tab normally).
- Offline single-file `.html` download link, flagged "Chrome/Edge only — Safari/Firefox will silently lose data with this file, use the hosted app instead."
- Utilization formula toggle (logged-hours vs. capacity-hours denominator — see Open Question 1).
- Data reset/clear (double-confirm, scary red).

---

## 3. Data Model

All objects carry a `schemaVersion` for forward compatibility. Comments below are illustrative (not strict JSON) for readability.

### 3.1 Firm Settings

```jsonc
{
  "schemaVersion": 1,
  "firm": {
    "firmId": "uuid",
    "firmName": "Studio Ninefold Architecture",
    "phaseTemplate": "AIA-6",          // "AIA-6" | "RIBA-8" | "custom"
    "utilizationDenominator": "logged", // "logged" | "capacity" — see Open Q1
    "defaultWeeklyCapacityHours": 40
  },
  "people": [
    { "personId": "uuid", "name": "Priya Raman", "email": null, "weeklyCapacityHours": 40, "active": true }
  ],
  "projects": [
    {
      "projectId": "uuid",
      "clientName": "Miller Family",
      "projectNumber": "2026-014",
      "projectName": "Miller Residence",
      "status": "active",                 // active | on_hold | closed
      "billingMethod": "fixed_fee",        // fixed_fee | hourly | pct_construction_cost
      "fee": 85000,
      "phases": [
        {
          "phaseId": "uuid",
          "name": "Construction Documents",
          "aiaCode": "CD",
          "sequence": 4,
          "budgetedHours": 320,
          "budgetedFee": 34000,
          "billableDefault": true,
          "status": "open"                 // open | closed
        }
      ]
    }
  ],
  "nonProjectBuckets": [
    { "id": "marketing", "name": "Marketing / Business Development", "billableDefault": false },
    { "id": "admin", "name": "Firm Admin / Internal", "billableDefault": false },
    { "id": "pto", "name": "PTO / Vacation / Sick / Holiday", "billableDefault": false },
    { "id": "prof-dev", "name": "Professional Development", "billableDefault": false }
  ],
  "activities": [
    { "activityId": "design", "name": "Design", "billableDefault": true },
    { "activityId": "drafting", "name": "Drafting / Production", "billableDefault": true },
    { "activityId": "client-meeting", "name": "Client Meeting", "billableDefault": true },
    { "activityId": "client-revision", "name": "Client-Requested Revision", "billableDefault": true },
    { "activityId": "coordination", "name": "Consultant Coordination", "billableDefault": true },
    { "activityId": "site-visit", "name": "Site Visit / Observation", "billableDefault": true },
    { "activityId": "research", "name": "Research / Code Review", "billableDefault": true },
    { "activityId": "specs", "name": "Specifications", "billableDefault": true },
    { "activityId": "renderings", "name": "Renderings / Visualization", "billableDefault": true },
    { "activityId": "permitting", "name": "Permitting", "billableDefault": true },
    { "activityId": "rfi", "name": "RFI Response / Submittal Review", "billableDefault": true },
    { "activityId": "punch-list", "name": "Punch List", "billableDefault": true },
    { "activityId": "admin-office", "name": "Admin / Office", "billableDefault": false },
    { "activityId": "it", "name": "IT / Software Management", "billableDefault": false }
  ]
}
```

### 3.2 Time Entry

```jsonc
{
  "id": "uuid",
  "schemaVersion": 1,
  "employeeId": "uuid",
  "employeeName": "Priya Raman",      // denormalized so a dropped file is self-contained
  "date": "2026-07-02",               // the date work was PERFORMED, not entered
  "projectId": "uuid | 'marketing' | 'admin' | 'pto' | 'prof-dev'",
  "projectName": "Miller Residence",
  "phaseId": "uuid | null",
  "phaseName": "Construction Documents (CD)",
  "activityId": "client-revision",
  "activityName": "Client-Requested Revision",
  "hours": 1.5,                       // decimal, quarter-hour increments
  "billable": true,
  "outOfScope": true,                 // maps to "Additional Services" concept
  "requestedBy": "Client (phone call 7/2) — added skylight, confirming in writing",
  "notes": "Sketch + email follow-up re: skylight change",
  "source": "manual",                 // manual | timer | import
  "createdAt": "2026-07-02T16:40:00Z",
  "updatedAt": "2026-07-02T16:40:00Z"
}
```

### 3.3 Export File (one per person per period)

```jsonc
{
  "schemaVersion": 1,
  "exportType": "time-entries",
  "exportedAt": "2026-07-05T13:02:11Z",
  "employeeId": "uuid",
  "employeeName": "Priya Raman",
  "firmName": "Studio Ninefold Architecture",
  "periodStart": "2026-06-29",
  "periodEnd": "2026-07-05",
  "referencedEntities": {
    // minimal denormalized project/phase/activity info so the importer
    // can auto-create anything missing on the manager's machine
    "projects": [ { "projectId": "uuid", "projectName": "Miller Residence", "clientName": "Miller Family" } ],
    "phases": [ { "phaseId": "uuid", "projectId": "uuid", "name": "Construction Documents", "aiaCode": "CD" } ]
  },
  "entries": [ /* array of Time Entry objects, as above */ ]
}
```

**CSV export** (parallel format, for Excel/QuickBooks/Harvest-migration familiarity): `Date, Client, Project, Phase, Activity, Hours, Billable, OutOfScope, RequestedBy, Notes, Employee`. Column-header matching (not position matching) on import, mirroring how the importer also reads real Harvest exports (`Date, Client, Project, Task, Notes, Hours, First Name, Last Name, Billable?`).

---

## 4. Manager Aggregation Flow

1. **Export**: Each staff member exports their period file from My Reports/Export (JSON preferred for round-trip fidelity; CSV also available). Recommended cadence: weekly, matching the "before Friday noon" submission culture already common in firms.
2. **Hand-off**: File goes into whatever the firm already uses — a shared drive/OneDrive/Dropbox folder, or email attachment to the principal. No third-party server touches it at any point.
3. **Import**: Manager opens Dashboard view, drags one file, many files, or an entire folder onto the drop zone (folder drops are filtered to `.json`/`.csv`, ignoring `.DS_Store`/OS cruft). Chromium users can alternatively use a native multi-file picker.
4. **Validate**: Each file is checked for `schemaVersion` and minimum required fields (Date + Hours + Project, per Harvest-migration precedent). Malformed rows are flagged in the import log, not silently dropped or fatal to the rest of the file.
5. **De-dupe / replace logic** (day-level, not period-level, to survive cadence mismatches — e.g. someone exports monthly while others export weekly):
   - For every date present in the incoming file, **delete any existing entries for that employeeId + that date**, then insert the new entries for that date.
   - This means re-importing the same person's corrected file, or a person who exports both weekly and later a monthly catch-up, always converges to "whatever the most recently imported file said for that day" — never duplicates, never silently appends.
6. **Import log entry** recorded: file name, employeeId, date range, entry count, timestamp, and whether it was a fresh import or a replace of N prior entries — this log is what powers the "who hasn't submitted" alert.
7. **Dashboard recomputes** all metrics live from the merged local store (manager's own IndexedDB — see Open Question 2 on multi-principal setups).
8. **Rollup export**: Manager can export a firm-wide CSV (all people, all projects, chosen date range) for bookkeeping/QuickBooks entry or board reporting.

---

## 5. Dashboard Metrics V1

| # | Metric | Formula | Question it answers |
|---|---|---|---|
| 1 | **Utilization Rate** (firm-wide + per-person) | Billable Hours ÷ Total Hours Logged × 100 (v1 default denominator — see Open Q1) | "Are we on pace? Who's overloaded or underused?" |
| 2 | **Phase Budget Burn** | Actual Hours (phase) ÷ Budgeted Hours (phase) × 100, shown next to phase status (open/closed) | "Which phase is burning fee faster than it's progressing?" — the end-of-phase-surprise catcher |
| 3 | **Out-of-Scope Hours** | Count and % of phase/project hours flagged `outOfScope`, trended week over week | "Is this project quietly turning into unpaid extra work?" |
| 4 | **Non-Billable % by Category** | Non-billable hours ÷ Total hours × 100, broken out by activity/bucket (Admin, BD, PTO, Prof Dev), trended monthly | "Is non-billable time creeping, and where specifically?" |
| 5 | **Hours by Project / Client / Phase / Person** | Raw sums, filterable table + bar chart (Harvest's four-tab report, matched) | "Where did the hours actually go this period?" |
| 6 | **Missing / Stale Submission Alert** | Flags any active person with no import covering the last N days (default 7), or an imported work-week with a 0-hour weekday | "Who hasn't submitted, and did someone forget a day?" |
| 7 *(optional, off by default)* | **Value of Time Logged** | Billable hours × person's billing rate (only if rate is entered — field exists in schema, not required) | "What's this period's hours worth, roughly?" — soft on-ramp to future invoicing/realization metrics |

---

## 6. The 5 Details That Earn Trust in Week 1

1. **Copy Last Week** — one click repopulates the grid's project/phase rows for a new week; removes the single biggest cited cause of timesheet abandonment (re-entering the same rows every Monday).
2. **Standing PTO/Admin rows, always visible** — Vacation, Sick, Holiday, Admin are pinned rows from day one, not something a new hire has to find in a picker.
3. **Real AIA phase codes out of the box** (SD/DD/CD/Bidding/CA/Closeout) — not "Phase 1/2/3." Architects recognize the vocabulary instantly; it signals the tool was built *for* them, not generically retrofitted.
4. **Harvest CSV auto-detect on import** — dropping a real Harvest export (`Client,Project,Task,Notes,Hours` header shape) is recognized automatically and mapped without configuration, so switching costs nothing and prior history isn't lost.
5. **Print-friendly timesheet** — looks and behaves like the paper/Excel timesheet the firm already trusts for records/approvals, via plain browser Print → Save as PDF, no export-then-reformat step.

*(Honorable mention, close 6th: the weekly total bar against a 40h target — the daily/weekly self-check heuristic staff already use mentally, made visible instead of requiring mental math.)*

---

## 7. Out of V1 — Explicit Non-Goals

| Feature | Decision | Why |
|---|---|---|
| **Invoicing** (hours → invoice) | Out | Harvest research: used but not decisive; natural paid-tier feature later. V1 CSV export is the invoicing "input," not the invoicing tool. |
| **QuickBooks/Xero sync** | Out | Requires a server/API credentials — violates the no-backend constraint entirely. Clean CSV export of hours-by-phase-by-client is the substitute; positioned explicitly as "feeds whatever accounting tool you already use." |
| **Cloud sync across devices** | Out | The literal reason there's no per-seat/usage pricing problem to escape from is that there's no server. Deferred to a future paid sync tier, sold as "same local data model, sync toggled on," per the Obsidian precedent. |
| **Live/real-time team dashboard** | Out | Same reason — real-time requires a server. Batch weekly import is reframed as a feature ("a weekly snapshot, not a live feed") rather than a limitation to apologize for. |
| **Start/Stop Timer** | Out (v1.1 candidate) | Grid/manual entry is the dominant real-world pattern for architects specifically (task-switching within the hour makes timers a poor primary fit) and covers both live and Friday-reconstruction entry. A running timer adds real complexity (persistence across tab close/reload, no true multi-device sync to reconcile against) for a feature the architect-specific research calls "nice-to-have, not primary." Cut from v1 to protect scope; revisit fast if user feedback demands it. |
| **Native mobile app** | Out | PWA install (Add to Home Screen / Dock) plus a mobile-responsive "Log this now" quick-add covers the site-visit capture need without an app-store build/distribution burden. |
| **Resource planning / staffing forecast, Gantt/PM features** | Out | Explicitly not a PM tool (matches Harvest's own positioning and the research's "don't chase this" guidance) — firms that want PM already have Monograph/Deltek/ArchiOffice as an option; this tool stays in its lane. |
| **Per-project custom rate cards / cost-rate bookkeeping** | Out | Data model reserves the fields (so no future migration pain) but no UI exposes them in v1 — avoids recreating the granular-taxonomy anxiety Harvest's metering created. |
| **Accounts / logins / roles / permissions** | Out (hard constraint) | Core to the product's promise. Anyone with the app can edit firm setup; this is a named trust/governance trade-off — see Open Question 5. |
| **Approval / lock workflow** | Out | Used mainly at firms with hierarchy layers this product's target (1–10 people, usually flat) doesn't have. An "imported/not yet imported" state is sufficient signal for v1; a real approval step is an easy, well-scoped v1.1 add if requested. |
| **SSO/SAML, activity logs** | Out | Enterprise-tier concerns, irrelevant below 10 seats. |

---

## 8. Open Questions for the Product Owner

1. **Utilization denominator**: default to "Billable ÷ Total Logged Hours" (simpler, no per-person capacity config required) or "Billable ÷ Capacity Hours" (matches how some firms already benchmark, but requires configuring each person's weekly capacity up front)? This spec defaults to *logged*, but users will compare the number against whichever benchmark they've personally seen (61% vs. 82% median depending on source) — worth a deliberate call, not a default.
2. **Multi-principal dashboards**: if two people at the same firm both want to see the manager dashboard, is there always exactly one "manager" whose IndexedDB is the source of truth (and who must separately export/share the aggregated rollup), or does the dashboard itself need its own export/re-import cycle so a second principal can maintain a synced copy? This affects whether Screen 2.5 needs its own export-for-re-import feature beyond the CSV rollup.
3. **Naming/branding**: pick a name (research surfaced Punch List, Redline, Studio Hours, Field Report, Scope Sheet, among others) — this drives the domain, SEO landing page URLs, and the auto-generated export filename convention (`{firmname}_{name}_...`).
4. **Timer exclusion confirmation**: does cutting the start/stop timer from v1 (Section 7) risk feeling like a step backward to a Harvest-switcher who's used to having one, even if they rarely use it — or is grid-only acceptable for launch given the architect-specific research?
5. **Firm-taxonomy governance under no-accounts**: since anyone can edit Projects/Phases/Activities (Screen 2.3) with no permission layer, is that acceptable as-is for v1 (small flat teams, high trust), or should there be a lightweight safeguard — e.g., a distinct "firm setup file" that only the manager distributes/re-imports, separate from time-entry files — to prevent an accidental rename from silently breaking cross-person reporting?

---

**Related files referenced during this task**: none created — this is a specification deliverable only, synthesized from the four research documents supplied in the task prompt (architect domain, Harvest-user, local-first technical, and free-tool-strategy research).