# Attack Session: Dave (6-yr Harvest principal, 8-person firm) + Priya (staff architect, hates timesheets)

**Dave, in one line:** "I don't fear a missing feature — I fear the one folder-drop or one renamed project that silently corrupts three months of billing history with no undo, and I won't find out until a client disputes an invoice."

**Priya, in one line:** "I'll use this exactly as designed for eleven days, until Chrome clears my week before I export it, or my phone entries from a site visit just... don't show up in my own weekly total."

---

## Top 10 Issues, Ranked by Severity

### 1. No stable person identity across devices — breaks the spec's own mobile workflow
The "Log this now" FAB is explicitly for phone site-visit capture, but `personId` appears to be minted locally on first run with no login. Priya's phone and laptop are different browser profiles → likely two different `personId`s for the same human. Her own weekly total silently undercounts (phone entries invisible in the laptop grid), and Dave's dashboard shows two "Priya"-shaped rows he has to manually reconcile by name-matching — fragile the instant two staff share a first name.
**Kills:** Priya (her own numbers look wrong, day one) and Dave (dashboard integrity).
**Fix (no backend):** Firm-setup wizard generates each person's `personId` once; Dave exports a tiny per-person "identity snippet" (short code/JSON) that each employee pastes in on *any* new device's first run instead of letting the app auto-mint a fresh one. No accounts, just a portable key.

### 2. Manager-side import is destructive with zero undo
The day-level "delete existing entries for employeeId+date, insert new" logic is clean in the happy path, but there's no soft-delete or import-history snapshot — a wrong folder dragged in (last month's instead of this week's) silently overwrites correct, more-recent billing data. The import log records a *count* ("replaced 12 entries"), not the actual rows destroyed. One bad drag-and-drop is unrecoverable.
**Kills:** Dave — this is precisely the "protective of billing data" nightmare; one incident and he never trusts the tool again.
**Fix:** Before any replace, stash the overwritten entries in a local "import history" store (soft delete). Add an "Undo this import" action in the Import Log for at least the last N imports. Still zero backend — just don't throw away what you're overwriting.

### 3. Un-exported work has no safety net — the employee's laptop *is* the database
Browser storage getting cleared (IT policy, "clear cookies" troubleshooting, OS reinstall, incognito habit) is explicitly acknowledged as a risk (hence the install nag), but the mitigation is a dismissible weekly banner. If Priya's week gets wiped Thursday night before Friday's export, she's back to memory-reconstruction — except now she's reconstructing data she already *entered once*, which is worse than never having a tool. For Dave: a departing/terminated employee whose laptop gets wiped by IT before their final export means that person's last 1-2 weeks of billable hours are gone forever, with no cloud fallback, ever.
**Kills:** Both, in different failure modes.
**Fix:** Auto-write a timestamped backup blob to a user-chosen local folder on every save (opt-in File System Access), not just on manual "Back up now." Make the install nag a persistent banner (not dismissible-for-a-week) until installed, since install measurably reduces eviction risk. Add an offboarding checklist item to the People screen: "mark inactive only after confirming final export received."

### 4. The evidentiary fields (`requestedBy`, `createdAt`) aren't tamper-evident
The whole "Additional Services" value prop rests on "contemporaneous record beats reconstructed argument" — but in a pure client-side app, `createdAt` is just a JS field editable via devtools or a doctored JSON before send. Nothing distinguishes a real Tuesday-afternoon entry from something typed Friday and backdated. This doesn't break week 1, but it quietly hollows out the tool's most-marketed differentiator the first time a client's lawyer asks "how do we know this wasn't added after the fact?"
**Kills:** Dave's confidence in the feature's actual legal weight (slow-burn, not week-1, but real).
**Fix:** Treat the *export file* — with its own `exportedAt`, typically emailed or drive-synced with third-party timestamps (mail server, OneDrive metadata) — as the actual evidentiary artifact, not the live-editable local store. Say this explicitly in help copy so Dave's expectations are calibrated, rather than implying the local record itself is defensible.

### 5. No-permissions taxonomy editing (Open Question 5) is a live landmine, not just an open question
Any of Dave's staff can rename or delete a project/phase/activity that's in use, with no audit trail. A junior "fixing a typo" in "Miller Residence" silently orphans every past entry firm-wide, with no undo beyond manually re-importing an old firm-settings backup (if Dave even has one handy).
**Kills:** Dave — flat trust in shared data integrity.
**Fix:** Split firm setup into its own distinct, separately-exported/imported file that only Dave's machine treats as canonical. Staff installs get a read-only copy (refreshed from Dave's periodic re-export) and can only *propose* new projects/phases locally (flagged pending) rather than freely rename/delete shared taxonomy.

### 6. Utilization alerts don't account for role — will false-alarm on the principal himself
Research is explicit: principals run ~40-65% utilization, technical staff 75-85%. The spec's Alerts panel (#6, "utilization outliers") uses one firm-wide band. Dave, who "also does billable work," will get flagged as an outlier every week purely because he's a principal — a false alarm on the founder in week 1 undermines confidence in the entire Alerts tab.
**Kills:** Dave's trust in the dashboard's signal quality.
**Fix:** Add an optional per-person target utilization range in People setup (default 75-85% for staff), and alert on deviation from *that person's* target, not one firm-wide band.

### 7. Post-export local edits silently diverge from the manager's copy, with no signal either side can see
If Priya fixes a mis-entered hour after exporting but forgets to re-send, Dave's dashboard holds stale numbers indefinitely — no checksum, no "as of" comparison is possible since Dave has zero visibility into her local state. This is a structural property of any offline/batch handoff, not fixable without a backend, but the spec doesn't name it as an accepted risk or coach around it.
**Kills:** Neither instantly, but quietly undermines every downstream billing/invoicing decision built on stale imported data.
**Fix:** No code fix crosses the constraint — instead, add explicit copy on the export screen ("edited a week you already sent? re-export and resend — the manager's copy won't update itself") and a personal "last exported" indicator inside the employee's own app, not just the manager dashboard.

### 8. Soft-nudged `requestedBy` won't reliably produce the evidentiary trail the whole pitch depends on
Persona B's narrative depends on Priya having *already written* a substantive justification by the time Dave looks. But the notes field is only conditionally nudged, not required, on Out-of-Scope entries specifically. Real Friday-at-5pm Priya checks the box and writes "client call" — Dave discovers at invoicing time that metric #3 (Out-of-Scope Hours) has no substance behind the flagged hours, only a checked checkbox.
**Kills:** The flagship differentiator, slowly — not week 1, but the first time Dave tries to actually send an additional-services email off this data.
**Fix:** Make `requestedBy` **hard-required** the moment Out-of-Scope is checked (not just nudged). This doesn't violate "minimize required fields per cell" since it only fires on an opt-in flag the user chose to raise.

### 9. Overbuilt for v1: RIBA-8, the utilization-denominator toggle, and rewrite-in-place backups
Both personas are explicitly US small-firm/AIA-vocabulary users; RIBA-8 and blank/custom templates serve nobody in the described flows and just add settings surface. Worse, the denominator toggle asks a first-time principal to pick between "logged" vs. "capacity" *before he has any data to judge by* — the spec itself concedes this "requires a deliberate call," which is exactly the kind of decision a day-one user shouldn't have to make. The `showSaveFilePicker` "silently rewrite a real file" backup mechanism is clever but Safari/Firefox-incompatible (per the spec's own caveat) and adds edge cases (revoked permissions, moved file) for marginal convenience.
**Kills:** Neither directly, but adds scope/complexity risk and decision fatigue with zero usage moment in either persona's actual week.
**Fix:** Ship AIA-6 + a bare "custom" escape hatch only; hardcode denominator to "logged" (already the stated default) and drop the toggle from Settings until real user feedback demands it; simplify backup to "download a new timestamped file" without in-place rewrite.

### 10. Billing-rate field has no access boundary under the no-permissions model
The schema reserves a per-person rate field "for later," but it lives in the same firm-setup object that Screen 2.3 already lets anyone edit. The moment any firm turns it on even experimentally, every staff member with app access can see or edit colleagues' rates — compensation-adjacent data Dave would never want visible firm-wide.
**Kills:** Dave, the first time a staff architect stumbles on another person's rate.
**Fix:** Keep the rate field entirely out of any shared/importable file in v1 — not just "off by default" in the UI, but physically absent from the schema that staff machines ever read/write — until a real access-controlled paid tier exists.

---

### Also architecturally naive about billing (not top-10, but flag for the spec owner)
- **Phase budgets have no version history.** A legitimate mid-project fee amendment (Dave bumps CD from 320→380 budgeted hours) silently rewrites the denominator for *all past weeks'* burn %, making earlier overruns disappear retroactively with no record a change ever happened.
- **`pct_construction_cost` is schema-decorated but functionally unsupported** — no dashboard metric actually knows what to do with it (no construction-cost field, no derivable fee-per-hour target), yet it sits in the billing-method enum implying parity with fixed-fee/hourly. Either flesh it out or cut it from v1.

---

## Keep — Do Not Cut (genuinely load-bearing)

- **Day-level delete-and-replace de-dupe logic** (Section 4.5) — correctly survives cadence mismatch (weekly vs. monthly exporters) without duplicating or silently appending; this is better-designed than most local-first sync logic and should not be simplified away.
- **Copy Last Week** — the single highest-leverage retention feature per every source; removes the #1 cited abandonment cause.
- **Grid entry with tab-through, minimal required fields per cell** — matches the actual work pattern (task-switching within the hour); do not replace with a timer-first or chronological-log model.
- **Standing PTO/Admin pinned rows** — trivial to build, disproportionately removes new-hire friction.
- **Out-of-Scope checkbox + Requested-By field on the entry itself** (even though #8 above says the *enforcement* needs tightening, the field's existence and placement — at the moment of logging, not reconstructed later — is exactly right).
- **AIA 6-phase default with real SD/DD/CD/Bid/CA codes** — the single biggest "built for us, not generic" signal both personas would notice immediately.
- **Column-header-matching CSV import + Harvest-shape auto-detect** — this is the actual switching-cost killer; a Harvest refugee's whole migration story depends on it working on the first try.
- **Print-friendly `@media print` timesheet** — zero-cost, high-trust bridge to the paper/Excel record firms already rely on for approvals.
- **Weekly total progress bar against capacity** — matches the mental model staff already self-check against; don't bury it in a report screen.