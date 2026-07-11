# Harvest-Refugee Time Tracker — Free-Tool & Distribution Strategy

## A. Tool type + scope implications

**Skill files found and read** at `C:\Users\a.alghamdi\.claude\skills\free-tool-strategy\SKILL.md` + `references/tool-types.md` (a duplicate copy also exists under `commands\free-tool-strategy\`).

The skill's taxonomy is: Calculators, Generators, Analyzers/Auditors, Testers/Validators, Libraries/Resources, Interactive Educational. None is a perfect fit because the skill assumes a **small free gadget that markets a separate paid product**. This project inverts that: the free tool *is* the product, and the future paid tier is the thing being "marketed" by it. Reframed, it lands as a **Generator/Library hybrid**:

- **Generator** — its core loop (log time → export CSV/JSON) matches the skill's "Template generator" pattern almost exactly: *"Output should be immediately usable, offer download/export options."* The exported timesheet/report IS the generated artifact.
- **Library** — the timesheet-template searchers (real volume per the brief) are Library-type intent: they want a ready-made reference object, not a philosophy.

**Scope implications (applying the skill's MVP rules directly):**
- Core functionality only: timer + manual entry, project/phase list, weekly view, CSV/JSON export, drag-and-drop import for the manager dashboard. Nothing else in v1.
- Skip initially (per skill: *"accounts, saving results, advanced features, every edge case"*): logins, cloud save, invoicing, utilization analytics, integrations, overtime/multi-currency rules.
- Because it's ungated entirely (no email wall, no account), it lands in the skill's "Ungated entirely — pure SEO/brand" lead-capture row. That's correct here: gating would violate the "no signup" promise that IS the pitch.
- Skill's Build-vs-Buy criteria ("unique concept, core to brand, high strategic value, dev capacity") all clearly say **build custom** — this isn't a tool adjacent to the brand, it *is* the brand.

---

## B. Positioning — stress test

**Proposed:** *"Free time tracking for architects — no signup, no cloud, your data never leaves your computer."*

**Is local-only real or a liability? Both — and it has to be framed, not hidden.**

Real differentiator, right now, for this audience:
- **Structural pricing immunity** — no backend means no seat/project metering, ever. This is the literal cure for the $770→$6,000 origin wound; it's not a claim, it's an architecture fact.
- **Confidentiality** — firms sit on client fee data, institutional/government project hours; "never leaves your computer" is a real security property, not a slogan.
- **Offline-capable** — site visits, older office networks, no login wall.
- **No vendor lock-in / no shutdown risk** — nothing to be "rejected" from (direct rebuttal to the AIA complaint that vendors turn away small firms).

Real liability, must be engineered around rather than denied:
- No cross-device sync (log at office, data isn't there at home).
- No automatic offsite backup (browser storage cleared = data gone).
- Manual, batch aggregation instead of live team visibility.

**Reframe the import/export flow as a feature, not a workaround:**
> "Your firm's data, on your firm's drive." Time entries are just another project file — they live next to drawing sets and consultant files in the same OneDrive/Dropbox/server folder architects already trust for everything else. Nothing is silently synced to a third party's database that vanishes the day you stop paying.

Also reframe the *cadence*: position the weekly import as a deliberate ritual (like timesheet submission already is), not surveillance — "a weekly snapshot, not a live feed" is a selling point for staff who resent being watched in real time.

**3 headline options:**
1. "Time tracking for architecture firms. No signup. No cloud. No $6,000 surprise bill."
2. "Your firm's hours, on your firm's drive — free time tracking built for architects."
3. "The Excel timesheet, reinvented — free, local, and yours forever."

---

## C. Channel plan (ranked)

**Owned SEO pages** (build these as literal landing pages, not just marketing copy):
1. `/harvest-alternative-for-architects` — bottom-funnel, catches people mid-price-shock, literally right after they get the renewal email.
2. `/architect-timesheet-template` — highest-volume, lowest-intent-but-highest-count query; ship a free downloadable Excel/Sheets template *alongside* the app (classic Generator move) to catch searchers who don't yet know software could replace their spreadsheet.
3. `/free-time-tracking-for-architects` — category term.
4. Comparison pages: vs. Harvest, vs. BQE Core/Deltek (the "rejected us for being too small" incumbents), vs. "Excel timesheet" (the actual status-quo competitor for this audience).

**Community seeding, ranked by intent quality:**
1. **AIA Community Hub** (Small Firm Roundtable / Practice Management forums) — this is almost certainly where the original $770→$6,000 complaint and the "vendor rejected us / no QuickBooks / no Mac" gripes live. Highest-intent, most specific audience.
2. **r/Architects** (and r/ArchitectureStudents secondarily) — search existing threads on "Harvest price increase" / "time tracking recommendations"; answer with real value first, mention tool second; a timed "I built this" post works once the origin story is ready to tell.
3. **EntreArchitect community** (Facebook group + Mark LePage's podcast/newsletter) — this audience is *entirely* solo/small-firm principals obsessed with practice economics; a guest mention or tool feature here is unusually high-signal for almost no ad spend.
4. **Archinect forums** ("Professional Practice" subforum + Archinect News tips) — more design-culture, but practice pain still surfaces; good for a "show and tell" post and possible press pickup.
5. **LinkedIn** — small-firm principals + AIA Practice Management Knowledge Community; the "$770 to $6,000" line is a ready-made, quotable hook.
6. **Direct search-and-reply** on X/Reddit for people actively complaining about a Harvest renewal — low volume, very high conversion, worth doing by hand early on.
7. **Show HN / Product Hunt** — secondary; the "local-first, no account, no backend" angle plays well to that crowd for backlinks/SEO authority even though they're not the buyer.

---

## D. Free → paid path

**Stays free forever** (never crippled): timer + manual entry, projects/phases, local dashboard, CSV/JSON export/import, manager aggregation via drag-and-drop. This is the trust mechanism — the whole positioning rests on this never becoming bait-and-switch.

**Paid tier sells only what genuinely *requires* a server** — each item maps 1:1 to a liability named in section B, so the upgrade feels earned, not artificial:
1. **Cloud sync across devices** — removes the manual export/import step (the one real friction point).
2. **Live team dashboard** — real-time hours instead of weekly snapshot.
3. **Multi-user accounts/roles** — the free tool has no concept of "accounts" at all, so this is structurally new, not a removed freebie.
4. **QuickBooks/Xero sync** — directly answers the AIA complaint about vendors lacking accounting integration; a clean, sellable, well-scoped feature.
5. **Automatic backup/version history** of time data.
6. **Cross-project historical/utilization reporting** — needs a persistent server-side store to be worth building.

**Design principle:** the paid tier is a *sync toggle layered on the same local data model*, not a rebuild — upgrading means "turn on sync," never "start over" or "your local version now nags you." Closest real-world precedent worth citing internally: Obsidian (free local-first app + optional paid Sync/Publish) — proof this exact free-forever-local + paid-sync-layer model works and builds trust rather than eroding it, unlike the SaaS metering model this product exists to escape.

---

## E. Name ideas

| Name | Rationale |
|---|---|
| **Punch List** | Real AEC jargon (final pre-closeout item list) + literal pun on "punching a clock" — brandable and instantly legible to architects. |
| **Redline** | "Redline" = architect's markup/revision term; one word, precise, evokes correction and rigor. |
| **Billable** | Blunt, descriptive, ranks directly for "billable hours tracker" search intent — trades brandability for SEO. |
| **Set Hours** | Pun on a construction-document "set" + tracking hours; short and architecture-native. |
| **Studio Hours** | "Studio" is how architects refer to their own office — warm, in-house, anti-corporate framing vs. faceless SaaS. |
| **Field Report** | Echoes the site-visit field report architects already file — implies honest, ground-truth logging. |
| **Drafting Table** | Nostalgic nod to the analog tool architects associate with ownership/craft — direct emotional contrast to a rented SaaS seat. |
| **Scope Sheet** | Ties to "project scope," core vocabulary; descriptive, SEO-friendly for "project scope time tracking." |

---

## F. What the skill said (fit notes)

Both copies located and read (`skills\free-tool-strategy\` and `commands\free-tool-strategy\` — identical content). Key adaptations made because the skill assumes a **lead-gen gadget for a separate paid product**, while here the free tool **is** the product:
- Treated the *future paid cloud/team tier* as the "core product" the skill's framework wants the tool to be adjacent to and naturally lead toward.
- Applied its MVP-scope rule (skip accounts, sync, advanced features initially) as the literal free-tier feature freeze.
- Applied its "Ungated entirely" lead-capture row as justification for zero signup/email walls.
- Applied its Evaluation Scorecard informally: search demand (strong — "architect timesheet template" has real volume), audience-to-buyer match (very high), uniqueness vs. Harvest/BQE (high), natural path to paid (high, via sync/QuickBooks), build feasibility (high — no backend actually *lowers* build cost), link-building potential (high, thanks to the specific, quotable $770→$6,000 villain story) — this scores as a strong candidate under the skill's own rubric even though its "type" doesn't cleanly fit the six-bucket taxonomy.