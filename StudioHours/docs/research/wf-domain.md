# Time-Tracking Research for Architecture Firm Tool — Raw Findings

## A. Must-have data fields for a time entry (with rationale)

| Field | Why it's required |
|---|---|
| **Date worked** | Basis of all reporting; must be the date work was *done*, not date entered (research shows entries are frequently backfilled — the tool must still capture true work-date, not entry-timestamp) |
| **Project** | Primary billing/reporting unit; every firm resource (Monograph, BQE, Deltek) treats project as the top-level container |
| **Phase** (SD/DD/CD/Bidding/CA/etc.) | Fee is allocated and consumed by phase (AIA B101 ties compensation to phase %); phase-level burn is the #1 thing PMs watch. Basebuilders: "very few solutions allow you to track time by phase, which makes it hard to understand how long phases take to complete" |
| **Activity/Task type** (design, drafting, revision, coordination, site visit, meeting, admin…) | Same phase-day can span multiple activity types; activity-level granularity is what reveals *why* a phase is over budget (design work vs. client-requested revision vs. consultant coordination) — this is the single biggest lever for scope-creep detection per Basebuilders |
| **Hours** | Core quantity. Grid/day-total entry (not start/stop timer) is the dominant real-world pattern because architectural work is "non-linear and context-heavy" — switching between calls, Revit, markups, coordination emails in the same hour makes timers annoying and inaccurate |
| **Billable / Non-billable flag** | Feeds utilization rate directly; must be settable per entry, with phase/project able to force a default (e.g., internal/marketing project = always non-billable) |
| **Note / description** | Best practice cited: "each time entry include activity codes **and a one-line note** so the narrative travels straight onto the invoice." Also the #1 defensibility field for additional-services claims |
| **"Requested by" / out-of-scope flag** | The evidentiary field for change-order/additional-services claims. No single source gave a canonical field name, but the consistent pattern across Deltek/AIA Trust/design-ops guidance is: contemporaneous, written record of *who asked* + *when* + *what* beats a reconstructed argument later. A boolean "outside original scope" checkbox + free-text "requested by" field operationalizes this without needing a separate change-order module |
| **Staff member** | Needed once >1 person uses the export/import model — every entry must self-identify its author since files get merged blind by the manager |
| **Billing/cost rate at time of entry** (optional, for later paid tier) | Enables job-costing ($ burn, not just hours) for fixed-fee firms; not required for MVP but field should exist so it can be populated later without a schema migration |

Not required but validated as valuable: expense/receipt attachment (mentioned by Monograph as a nice-to-have, not core), client name (derivable from project).

## B. Recommended default phase list + default activity list

**Default phase list — use the AIA six-phase structure** (this is what the target market already speaks, per AIA B101-2017 and universal in US small-firm practice):

1. Pre-Design (programming/feasibility)
2. Schematic Design (SD) — typical fee share **15%** (range 10–25%)
3. Design Development (DD) — **20%** (range 10–25%)
4. Construction Documents (CD) — **40%** (range 35–50%, largest single phase)
5. Bidding/Negotiation — **5%**
6. Construction Administration (CA) — **20%** (range 20–30%)

Optional 7th bucket firms commonly add: **Closeout** (punch list, warranty, post-occupancy) — often folded into CA but worth a distinct phase since it's a common gap where CA hours "run out" before punch-list work is done.

Non-project buckets that must exist as pseudo-projects (every firm needs these; can't force all time into client projects):
- **Marketing / Business Development** (proposals, networking)
- **Firm Admin / Internal** (staff meetings, bookkeeping, software/IT)
- **PTO / Vacation / Sick / Holiday**
- **Professional Development** (continuing ed, licensing hours)

(RIBA Plan of Work 2020 uses 8 stages, 0–7, and is the UK equivalent — worth supporting as an alternate phase template for future localization, but AIA is the correct default given the target market explicitly references AIA/AIA Community Hub.)

**Default activity list** — nest these *under* phase, not instead of it (Basebuilders: "structure time entries around activity types that map to how architectural work actually happens"):

Billable activities:
- Design
- Drafting / Production (document production)
- Client Meeting
- Client-Requested Revision *(distinct from plain "Revision" — this is the scope-creep tell)*
- Consultant Coordination
- Site Visit / Observation
- Research / Code Review
- Specifications
- Renderings / Visualization
- Permitting
- RFI Response / Submittal Review (CA-heavy)
- Punch List

Non-billable activities:
- Admin / Office
- Business Development / Marketing / Proposals
- Internal / Firm Meetings
- Professional Development / CE
- PTO / Vacation / Sick / Holiday
- IT / Software Management

Keep both lists short by default (6–8 phases, ~10 activities) — research on non-billable time codes (Architekwiki) shows real firms use exactly this scale (Admin, Business Development, Internal Meetings, Training, PTO), not sprawling taxonomies. Let the firm rename/add but ship with these as sane defaults so day-one users don't hit an empty picker.

## C. Employee workflow reality (how entry must work to get filled honestly)

- **Grid layout is the de facto standard**: rows = project + phase (project number, project name, phase, description), columns = Mon–Sun, cell = hours; totals auto-sum by row and column (Monograph's own timesheet template, and virtually every timesheet tool, uses this exact shape). Build the core UI as this grid, not a chronological list.
- **Daily logging beats weekly reconstruction, but weekly reconstruction is what actually happens.** Guidance explicitly says "log your hours daily so you don't forget," but the honest failure mode is architects "reconstruct hours from memory days after the work was done" because "the work of an architect is non-linear and context-heavy" (calls, Revit, markups, coordination emails interleaved). Design implication: the tool must be equally usable for (a) live daily entry and (b) Friday-afternoon reconstruction of the whole week — don't force a timer-only or single-entry-per-day model.
- **Timers are a nice-to-have, not the primary input.** Multiple sources push timer-based tracking as *more accurate*, but the nature of architectural work (task-switching within the hour) makes start/stop timers a poor fit as the *only* mechanism. Support optional running timer but the grid/hours-typed-in model must be first-class.
- **"Copy last week" / duplicate-row is a named, expected feature** — "if you're working on similar tasks each week, auto-populate the timesheet with last week's tasks" and "resources can bulk-copy from previous weeks." This is not optional polish; it's a core retention feature for recurring project/phase rows.
- **Minimize required fields per cell.** The friction that kills compliance is a "clunky" multi-field-per-entry process; the fix is a "clean, intuitive interface" — practically: project+phase+hours should be enter-able in one motion (dropdown + number), with activity/notes as a secondary, optionally-required layer (require notes only when hours are large, non-billable, or flagged out-of-scope — don't force a note on every single cell).
- **Pre-populate standing rows**: Holiday, Vacation, Sick as always-visible rows in the grid (per Monograph's real template) so PTO capture is a checkbox-like action, not a lookup.
- **Site-visit / mobile capture matters** — CA-phase site observation time is explicitly called "the phase where architectural time tracking matters most and happens least," so quick mobile entry (or at minimum, a frictionless "log this now" path) is disproportionately important for CA/site-visit activities.
- **Daily billable target framing, not just weekly %**: firms translate utilization into a daily heuristic staff can self-check against — e.g. "no more than 1 hour/day non-billable" or "~6.4 billable hrs of an 8-hr day" (80% utilization). Consider surfacing a simple daily/weekly progress bar against a target rather than only a monthly percentage, since that's the mental model staff actually use.
- **Submission rhythm**: weekly deadline culture (commonly "before Friday noon") with a lock/approval step is the norm — but the underlying data should stay editable/loggable daily; only submission/lock is weekly.
- **Rounding behavior**: entries are typically whole or half/quarter hours per phase-activity per day (not minute-precision timestamps) — matches the grid model, not a stopwatch log.

## D. Manager weekly/monthly questions → dashboard metrics (with formulas)

1. **"Are we on pace this month?"**
   → **Utilization Rate** = Billable Hours ÷ Total Hours Logged × 100 (some firms use ÷ Total *Available/Capacity* Hours instead — pick one and document it; industry uses both). Benchmarks: median ~62–82% depending on source/year; **healthy range 75–85%**; below ~60% = underused capacity; above ~90–95% = burnout risk. Should be viewable **firm-wide and per-person**, since target varies wildly by role (technical staff 75–85%, principals ~40–65%, project architects can hit 90%+).

2. **"Which phase/project is burning fee faster than it's progressing?"**
   → **Phase Budget Burn %** = Actual Hours Logged (phase) ÷ Budgeted Hours (phase) × 100, shown against **time elapsed in phase** or **% complete** as a second bar. The classic failure this catches: "a fixed-fee SD phase that's consumed 70% of its budgeted hours with significant design work still ahead." This is described industry-wide as the "**end-of-phase surprise**" — the single most damaging blind spot named across sources (EntreArchitect, Basebuilders).
   → **Budget Variance** = (Actual Hours/Cost − Budgeted) ÷ Budgeted × 100.

3. **"Is a specific client/project quietly turning into unpaid extra work?" (scope creep)**
   → **Client-Requested-Revision hours as % of phase hours**, trended week over week, per project. A spike here — especially in SD, where "scope creep looks identical to normal SD work" — is the actionable signal.
   → **Out-of-scope-flagged hours**, aggregated per project, as a running dollar-equivalent ("here's what we've given away") — directly supports an additional-services conversation with the client.

4. **"Who's overloaded, who's underused?"**
   → Utilization rate **by staff member**, plus **hours by non-billable category** per person, to catch senior staff burning time on admin ("paying premium labor rates for tasks that should not require premium labor").

5. **"What should we invoice this period?" (hourly/T&M firms)**
   → **Billable $ = Σ(billable hours × person's billing rate)**, grouped by project/client — a direct feed for invoice drafting even without integrated billing.

6. **"How much of the fixed fee's hour-budget is left, and does that match % complete?" (fixed-fee firms)**
   → **Job-costing / percent-complete check**: Hours Consumed ÷ Budgeted Hours vs. **Phase % Complete** (self-reported or milestone-based) — the core reconciliation fixed-fee firms need since they invoice on % complete, not raw hours, but still must know if hours are outrunning progress.

7. **"Is non-billable time creeping?"**
   → **Non-billable % by category**, trended monthly, compared to the firm's own baseline (rule-of-thumb overhead composition: ~11.5% general office, ~8.7% PTO, ~5.3% BD, rest scattered — total non-billable commonly running ~34% of all hours at a "successful" 66/34 split, though other benchmarks cite non-billable as low as ~19% at high-performing firms; treat as configurable, not hardcoded).

8. **(Future/paid tier) "Are we collecting what we bill?"**
   → **Realization Rate** = Net Revenue Collected ÷ (Billable Hours × Standard Billing Rate) × 100 — needs $ data the free local tool may not have yet, but the hours-side half (billable hours × rate = "value of time logged") is computable now and sets up realization tracking later.

Formulas explicitly sourced with numbers: Utilization (61–82% median depending on source/year), Realization (~83% avg, ≥90% high performers), Net Multiplier (Net Revenue ÷ Direct Labor Cost, avg 3.1), Overhead Multiplier (Overhead Expenses ÷ Direct Labor Cost, avg 1.5, or 162% overhead rate per Deltek 2023 study), Backlog % (Backlog $ ÷ Annual Net Revenue, avg 23.8%) — these last few are firm-financial KPIs, more relevant to a future paid/job-costing tier than the MVP hours-only dashboard, but worth keeping the data model compatible.

## E. Terminology architects use (so the UI speaks their language)

- **Phases**: Pre-Design, Schematic Design (SD), Design Development (DD), Construction Documents (CD), Bidding/Negotiation, Construction Administration (CA), Closeout — use these labels and the SD/DD/CD/CA abbreviations verbatim; architects think in these codes.
- **Basic Services** vs **Additional Services** — the contractual line the whole scope-creep problem revolves around; the app's "out of scope" flag should map conceptually to "Additional Services," a term architects already use with clients.
- **Utilization (rate)**, **Realization (rate)**, **Overhead / Overhead Rate**, **Multiplier** (net multiplier, overhead multiplier, billing overhead factor — architects/PMs use "multiplier" casually to mean net multiplier), **Fee Burn**, **Budget vs. Actual**, **% Complete**, **Backlog**.
- **Job cost / Job costing** — internal tracking of cost even on fixed-fee work.
- **NTE (Not-to-Exceed)** — a common fee-cap term.
- **Change Order**, **RFI (Request for Information)**, **Submittal**, **Punch List** — CA-phase vocabulary; if the tool has CA activity codes they should be named RFI Response, Submittal Review, Punch List, not generic "review."
- **Stipulated Sum / Fixed Fee**, **Percentage of Construction Cost**, **Hourly/T&M** — the three billing-method mental models; the dashboard framing (job-cost % vs. direct invoicing $) should match whichever the firm/project uses.
- **Reimbursables** — expenses billed separately from fee; adjacent to but distinct from time.
- **Scope Creep** — the exact phrase architects themselves use (not "scope expansion" or similar); use it in in-app copy/help text.
- **Level of Effort** — how architects describe why a phase's fee % doesn't match its time %.

## F. Top reasons timesheets fail + design countermeasures

| Failure mode | Evidence | Countermeasure |
|---|---|---|
| **Memory decay from end-of-week reconstruction** | "Manual logs get filled out at the end of the week when details are fuzzy"; architects task-switch within the same hour across calls/Revit/markups/email | Make the grid equally fast for daily *and* end-of-week entry; add a lightweight daily nudge/reminder; don't require a timer |
| **Clunky, high-friction UI** | "If staff avoid filling out timesheets, it's usually because the process is clunky" | Grid entry (project/phase rows × day columns), keyboard/tab-through, minimal required fields per cell, remember last-used project/phase |
| **Repetitive re-entry of the same project/phase every week** | "Copy last week" is a named, expected feature across every tool surveyed | Ship duplicate-week / duplicate-row as a core action, not an afterthought |
| **Perceived as surveillance with no value to the person filling it out** | "Employees don't understand the value in reporting their time" | Give employees their own read view (their utilization, their hours-by-project) so the data feeds back to them, not just upward |
| **Too many mandatory fields / rigid taxonomy** | Real firms keep non-billable categories to ~5–8 items (Admin, BD, Internal Meetings, Training, PTO) | Ship short default lists (6–8 phases, ~10 activities); require notes only conditionally (large hours, non-billable, or flagged out-of-scope), not on every cell |
| **Errors ripple into payroll/invoicing/budgets silently** | "A misplaced decimal or wrong project code in a shared spreadsheet can ripple through payroll, invoicing, and project budgets before anyone notices" | Inline validation (daily/weekly totals vs. expected hours), visible running totals, simple sanity-check flags (e.g., >12 hrs/day, 0 hrs logged for a work day) |
| **CA/site-visit time is hardest to capture, most consequential to skip** | CA called "the phase where architectural time tracking matters most and happens least" | Fast mobile-friendly entry path specifically for site-visit logging |
| **Scope creep invisible because revision time isn't separated from normal design time** | SD scope creep "looks identical to normal SD work" without an activity-level split | Default "Client-Requested Revision" as its own activity code, separate from plain "Design/Revision" |
| **No contemporaneous record of who asked for extra work** | Repeated guidance: "follow up in writing" at time of request; disputes are won/lost on contemporaneous records, not reconstructed arguments | "Out of scope" checkbox + "requested by" free-text field right on the time entry, so the evidence is created at logging time, not assembled later during a dispute |
| **Weekly-only cadence causes a Friday crunch and end-of-phase surprises** | "End-of-phase surprise" — team consumes the phase budget in the final weeks before anyone notices | Always-on budget-burn indicator per phase (not just a monthly report) so overruns are visible in real time, not discovered at invoicing |

## G. Sources found

- [Time Tracking for Architects: What Actually Needs to Be Tracked — Base Builders](https://www.basebuilders.com/articles/time-tracking-for-architects)
- [The Guide to Time Tracking for Architects — Monograph](https://monograph.com/blog/the-guide-to-time-tracking-for-architects)
- [Architecture Business Benchmarks: Utilization Rates — Monograph](https://monograph.com/blog/unlocking-utilization-rates-benchmarks-for-architects-and-architecture-firms)
- [Utilization Rate Guide for A&E Firms — Monograph](https://monograph.com/blog/utilization-rate)
- [Architect Timesheet Template — Monograph](https://monograph.com/templates/architect-timesheet-template)
- [Top Architect KPIs: Formulas, Examples and Benchmarks — BQE](https://www.bqe.com/blog/top-architect-kpis-formulas-examples-and-benchmarks-to-drive-performance)
- [8 Key Performance Indicators Architecture Firms Can't Ignore — Deltek](https://www.deltek.com/en/architecture-and-engineering/architecture-project-management/kpis-for-architects)
- [The Scope Creep Survival Guide for Architects — Deltek](https://www.deltek.com/en/architecture-and-engineering/architecture-project-management/scope-creep)
- [The 3 Most Common Pricing Methods for Architects — Deltek](https://www.deltek.com/en/blog/pricing-methods-for-architects)
- [Invoicing for Architecture Firms: Best Practices & Tools — Deltek](https://www.deltek.com/en/architecture-and-engineering/invoicing-architects)
- [When the Scope Slips: Lessons from History — AIA Trust](https://theaiatrust.com/when-the-scope-slips-lessons-from-history-on-architectural-boundaries/)
- [How to Handle Change Orders and Scope Creep — Operations by Design](https://www.design-operations.com/journal/how-to-handle-change-orders-and-scope-creep-in-architecture-projects)
- [Architecture Firm Financial Metrics That Separate Thriving Firms — EntreArchitect (Ep. 659)](https://entrearchitect.com/2026/05/12/architecture-firm-financial-metrics/)
- [Developing a Time Management Discipline — EntreArchitect](https://entrearchitect.com/2015/01/19/developing-a-time-management-discipline/)
- [2 Rules of Thumb for Architects to Allocate Time and Money — Architekwiki](https://www.architekwiki.com/wiki/2-rules-of-thumb-for-architects-to-allocate-time-and-money)
- [Your Billing Overhead Factor — Architekwiki](https://www.architekwiki.com/wiki/your-billing-overhead-factor)
- [Guide to Architectural Design Phases — Monograph](https://monograph.com/blog/guide-to-design-phases)
- [Defining the Architect's Basic Services — AIA](https://www.aia.org/resource-center/defining-the-architects-basic-services)
- [Calculating the Architect's Fee: Is There a Better Way? — AIA](https://www.aia.org/resource-center/calculating-architects-fee-there-better-way)
- [Summary: B101–2017 Standard Form of Agreement — AIA Contract Documents](https://help.aiacontracts.com/hc/en-us/articles/1500010280541-Summary-B101-2017-Standard-Form-of-Agreement-Between-Owner-and-Architect)
- [The RIBA Plan of Work 2020 — Architecture for London](https://architectureforlondon.com/news/the-riba-plan-of-work/)
- [RIBA Work Stages Explained — archisoup](https://www.archisoup.com/riba-work-stages-explained)
- [12 Key Features of Time Tracking Software for Architects — Total Synergy](https://totalsynergy.com/time-tracking-software-for-architects-12-key-features/)
- [Timesheet Automation Guide for Professional Services — Monograph](https://monograph.com/blog/automated-timesheets-architecture-firms-guide)
- [Time Tracking Software for Architects: 2026 Guide — Rize](https://rize.io/blog/time-tracking-software-for-architects)
- [Understanding Administrative and Non-Billable Time — Thomson Reuters](https://www.thomsonreuters.com/en-us/help/practice-cs/firm-administration/understanding-admin-and-nonbillable-time)
- [Neumann Monson: Architecture Fees Hourly vs. Percentage vs. Fixed](https://neumannmonson.com/blog/architecture-fees-hourly-percentage-fixed)
- [Neumann Monson: Construction Closeout — What to Expect](https://neumannmonson.com/blog/construction-closeout)
- [Harvest Price Increase 2026: The Agency Guide — TrackingTime](https://trackingtime.co/time-tracking-software/harvest-price-increase-agencies.html)
- [Harvest Pricing](https://www.getharvest.com/pricing)

## Notes on gaps for the spec writer
- No direct r/Architects or Archinect forum threads surfaced via search (search tool doesn't support `site:` operator reliably) — treat the "why timesheets fail" section as sourced from vendor/consultant content (Monograph, Deltek, BQE, ClickTime, eBillity), which is directionally reliable but not raw practitioner venting. If firsthand forum quotes are needed, that requires direct Reddit/Archinect browsing, not available in this pass.
- Utilization-rate denominator (total hours logged vs. total available/capacity hours) is inconsistent across sources (61% median per Deltek's 2023 study vs. 81.9% median per Monograph 2026 data) — the spec should pick one formula and be explicit about it in the dashboard, since firms will compare their number to whichever benchmark they've seen.
- Nothing found specifically on "defensible time entry field" as a named, standardized practice — the "requested by / out-of-scope" field recommendation is a synthesis from repeated softer guidance ("document in writing," "contemporaneous record") rather than a single canonical source; flag this as a design decision, not an industry standard.