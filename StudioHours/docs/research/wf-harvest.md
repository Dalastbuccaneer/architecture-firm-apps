# Harvest Research — Architecture-Firm Switching Angle

## A. Feature Usage Ranking (what v1 must match vs. can skip)

**Tier 1 — Must match (daily-use core, cited constantly in reviews):**
1. **Weekly timesheet grid** — the dominant mental model ("the weekly timesheet view matches how most people actually think about their work week"); a grid of rows (project/task) × days is the #1 expected UI, more used than the standalone timer.
2. **Start/stop timer + manual entry toggle** — one-click timer (browser/desktop widget) for people who track live, manual retroactive entry for people who fill in at day's end. Both patterns co-exist; Harvest has no automatic/passive tracking, and nobody seems to miss it.
3. **Client → Project → Task hierarchy** — "you create Clients, which contain Projects, Projects have Tasks that define the type of work (Design, Development, Meetings, Research…)." For architects this hierarchy = Client → Project → Phase (SD/DD/CD/CA), so v1 needs at least a 3-level structure, not flat "projects."
4. **Budget vs. fixed-fee tracking** — explicitly called out as *the* architecture use case: "manage how much billable time your team is putting into a project versus the fixed fee you charged your client." This is the single most architecture-specific need and the thing generic tools (Clockify/Toggl free) lack.
5. **Basic reports**: hours by project, by client, by task, by person, billable-vs-non-billable %/utilization. Four tabs (Projects/Clients/Tasks/Team) is the whole reporting surface most firms touch.
6. **CSV/Excel export** — table-stakes; treated as the release valve for "real" analysis (people export and re-crunch in Excel anyway).

**Tier 2 — Used but not decisive (nice-to-have for v1, don't block launch):**
- Invoicing (convert hours → invoice, Stripe/PayPal payment links) — loved by freelancers/very small firms, but one AIA thread noted Harvest "can do all but" profit/loss-by-phase reporting, i.e. invoicing is solid but not the differentiator.
- Expense tracking (mileage, materials, licenses) attached to invoices.
- QuickBooks Online integration/sync — repeatedly requested in the AIA Community Hub, but firms report QBO itself can't natively do AIA-style progress billing (G702/G703), so "QuickBooks sync" mostly means *exporting time/cost data cleanly*, not replicating AIA billing forms.
- Timesheet approval workflow + reminders (manager approves, system nags stragglers) — used at firms with any hierarchy, ignored by very small/flat teams.

**Tier 3 — Actively skip for v1 (rarely used / actively resented as bloat drivers):**
- Per-project custom rate cards, cost-rate vs. billable-rate double bookkeeping — power-user feature, and under the new pricing model each "project" and "task" literally costs money, so small firms avoid creating granular structures just to dodge fees (a perverse outcome worth calling out in marketing).
- Resource planning / staffing forecast (that's Harvest Forecast, a separate paid product) — desired by *growing* firms per one alternatives article, but out of scope for a 1–10 person free tool.
- SSO/SAML, activity logs, custom onboarding — Enterprise-tier only, irrelevant below 10 seats.
- Deep PM features (Gantt, task assignment/dependencies) — reviewers repeatedly say Harvest is deliberately *not* a PM tool ("focuses primarily on time and invoicing rather than comprehensive project management"), and firms that want PM go to Monograph/Deltek Ajera/ArchiOffice instead. Don't chase this.

## B. The Pricing-Change Story (3 sentences, for marketing copy)

Harvest was acquired by Bending Spoons (the Italian roll-up behind Evernote and WeTransfer) in mid-2025, and by 2026 it replaced its old flat per-seat pricing with a base seat rate ($9/seat/mo Teams, $14/seat/mo Enterprise) *plus* metered usage fees for every invoice, project, client, and task beyond a small included allowance. Renewal shock has been severe and public — small firms report bills jumping from **$12/month to $1,900/month**, from **$130/year to $168/year plus ~$720 in "estimated" usage fees**, or being auto-migrated to Enterprise quotes exceeding **$19,000/year**, all for teams that "weren't even power users, just a couple of projects, a few people tracking time." The net effect for a 1–10 person firm is that the *number of projects and phases you track* — the exact thing an architecture practice needs to track finely — is now the thing that inflates the bill, punishing the firms most likely to organize work by phase/task.

## C. Explicit Demands of Harvest-Alternative Seekers (with quotes)

- **Predictable, non-punitive pricing** — "The pricing change was IT for us to leave… once we saw how quickly the usage fees could pile up across different features made 0 sense to continue with harvest." People want a price that doesn't grow with how granularly they organize their own work.
- **No surprise renewal fees / transparent billing** — a Capterra reviewer: an undisclosed $80 application fee meant "on their first $2,000 invoice, they received only $1,861.70 with zero prior warning."
- **Simplicity over more PM features** — for cost-conscious teams, the ask is explicitly "affordable plans with basic time tracking," not CRM/resource-planning bloat; "if the issue is price and your workflow is still simple," people are pointed to Clockify/Toggl/FreshBooks-tier simplicity, not Harvest's up-sell path.
- **Keep the weekly-grid + timer UX** — nobody asks to replace *how* Harvest feels to use; the complaints are 100% commercial (pricing) and roadmap (stagnation), not UX. "No AI, no voice, no expense tracking, no new reporting" — feature stagnation is cited alongside price as a reason to leave, meaning switchers aren't looking for more features, just fair pricing on the same simple model.
- **Frustration with acquisition-driven vendor behavior** — general sentiment that Bending Spoons "has frequently carried out mass redundancies following acquisitions," feeding distrust of any VC/PE-owned tool — an opening for a message like "free, local, no company can ever reprice your own data."
- **Architecture-specific ask (AIA Community Hub)**: firms explicitly want phase/task profit-and-loss reporting ("all but" that one item was Harvest's gap per one 10-person firm), consultant/sub-consultant cost tracking, and tools that don't require a server (ArchiOffice needs Windows Server — a Mac/no-IT small firm pain point).
- **Support responsiveness** — "Getharvest is garbage… do not respond to emails for over 2 weeks" on integration/API issues — small firms with no IT department want something that just works without needing vendor support at all (reinforces the local-first, no-account pitch).

## D. Harvest Time-Report CSV Columns + Migration Import Design

**Caveat**: Harvest's own help-center pages (support.getharvest.com) blocked direct fetch (403), so exact human-readable CSV header text is best-effort, triangulated from (1) the authoritative public Harvest API v2 Time Entry object schema (fetched directly) and (2) multiple third-party "Harvest → X" migration guides (Clockify's official migration doc, Parakeeto). Recommend confirming exact header casing against one real exported file during build, but this is enough to design the importer now.

**Authoritative underlying data model** (Harvest API v2 `time_entries` object — confirms what a "Custom Export" can surface): `id, spent_date, user {id,name}, user_assignment, client {id,name}, project {id,name}, task {id,name}, task_assignment, external_reference, invoice, hours, hours_without_timer, rounded_hours, notes, is_locked, locked_reason, is_closed, approval_status, is_billed, timer_started_at, started_time, ended_time, is_running, billable, budgeted, billable_rate, cost_rate, created_at, updated_at`.

**Best-effort human-readable CSV export columns** (Detailed Time Report → Export → CSV/Excel), per corroborating sources:
`Date, Client, Project, Task, Notes, Hours, First Name, Last Name, Roles, Employee?, Billable?, Invoiced?, Approved, Billable Rate, Billable Amount, Cost Rate, Cost Amount, Start Time, End Time, External Reference URL`
(the report can be filtered/sliced by Projects / Clients / Tasks / Team before export, and a "Custom Export" lets the user pick which of the above columns to include — so real-world files from different firms will have *different column subsets/order*, which the importer must handle defensively.)

**Migration import design notes for our tool:**
1. **Header-name matching, not position matching.** Read the first row as headers, case-insensitively map `Date`→date, `Client`→client, `Project`→project, `Task`→phase/task, `Notes`→description, `Hours`→duration (decimal hours, not HH:MM — Harvest exports decimal), `Billable?`→billable flag (Yes/No or true/false — support both), `First Name`+`Last Name`→person. Ignore/pass-through unknown columns (rates, invoice status) rather than failing the import.
2. **Minimum viable column set to accept a file**: Date + Hours + Project (everything else optional) — mirrors Clockify's own "4 required fields" precedent (Email/User, Start Date, Start Time, Duration) but adapted to decimal-hours-only since that's Harvest's native unit and our tool has no "start/end time" concept necessarily.
3. **Auto-create missing entities on import**: if a Client/Project/Task/Phase named in the CSV doesn't exist locally, create it silently (color-coded as "imported") rather than blocking — this is the single biggest UX win over Clockify's importer, which requires admin pre-setup and a paid plan just to import.
4. **Decimal-hours parsing edge cases**: Harvest sometimes exports `Hours` as rounded vs. actual (`hours` vs `rounded_hours`) — if both columns are present, prefer the unrounded one but let user toggle.
5. **One-click "This looks like a Harvest export" detector** — sniff for the `Client,Project,Task,Notes,Hours` header combo and auto-select "Import from Harvest" template vs. generic CSV mapping UI, removing the need for the user to configure anything (this directly answers the origin complaint: no more manual re-entry when leaving Harvest).
6. **Also support the Harvest Project/Budget report and Expense report shapes** as a stretch goal, since firms migrating fee-budget history will want that history, not just raw time entries.

## E. Free-Competitor Weaknesses → Our Differentiation Angles

| Competitor | What breaks for a small architecture firm | Our differentiation angle |
|---|---|---|
| **Clockify Free** | As of **April 2026**, free tier capped at **5 users** (was unlimited) — a 6-person firm (the origin story firm!) is now pushed to pay just by headcount. CSV/Excel export is a **paid-only** feature; free tier exports **PDF only**. No per-project billable rates → can't compute fee-vs-actual $. No invoicing on free tier. Reporting date range capped at 31 days, no custom reports. "Reporting is too shallow for anything beyond surface level insights… no way to plan workloads or keep projects on budget." | We're free at **any** seat count forever (no server = no per-seat cost to us), CSV/JSON export is core not a paywall, and phase-level fee budgets are a first-class object, not a paid add-on. |
| **Toggl Track Free** | No billable rates, no project budgets/budget alerts (paid-plan-only, starting $9/user/mo Starter), no sub-tasks, no saved/custom reports, no scheduled reports. Unlimited projects/clients on free — good — but zero budget-vs-actual visibility, which is the exact thing a fixed-fee architecture project needs. | Phase/fee budget tracking (SD/DD/CD/CA against a fixed fee) built in from day one, free — this is Toggl's paywall, we make it the headline feature. |
| **Harvest itself** | Post-2026 usage-based fees mean *more projects/tasks/clients you track = more you pay* — actively punishes granular phase tracking. Free tier: 1 seat, 2 projects only. No offline mode (needs internet to log time). | Local-first: works fully offline, no seat/project/task metering ever, because there's no backend to bill against. |
| **Excel/Google Sheets templates** | Fully manual aggregation — someone has to open N files and consolidate by hand; version-proliferation ("many copies of your timesheets... confusion among your team") that gets "exponential" as team/projects grow; no real-time collaboration; error-prone, easy to lose data; no built-in reporting/rollup. | We keep the "just a file" simplicity architects already trust (export/hand-off model mirrors what firms already do with spreadsheets) but automate the aggregation step the manager currently does by hand — import-and-merge multiple team members' exports into one dashboard instantly. |
| **ArchiOffice / BillQuick / Deltek Ajera** (paid, architecture-specific, mentioned in AIA threads as what firms "graduate to") | Praised for phase/fee/profit-loss reporting but require a server (ArchiOffice explicitly runs on **Windows Server**), steep learning curve, real subscription cost, often no clean Mac story. | We give the phase/fee-budget capability these tools are valued for, with zero server, full Mac support, and zero cost — undercutting the "you'll outgrow free tools eventually" narrative these vendors rely on. |
| **QuickBooks (as project/time tool)** | AIA members: QBO "cumbersome" for growing firms, can't natively produce AIA G702/G703 billing forms, needs a bolt-on app just for AIA billing. | Not our job to replace QuickBooks — but clean CSV export of hours-by-phase-by-client is exactly the input QBO/bookkeepers need, so we position as "the timesheet layer that feeds whatever accounting tool you already use," Mac-friendly, no IT required. |

**Overall differentiation thesis**: every free/cheap competitor above monetizes exactly the axis a small architecture firm needs most — either seats (Clockify), budgets/reporting (Toggl, Clockify), or usage/granularity (Harvest) — because they all run a server that costs money to operate. Being genuinely local-first with no backend removes the reason any of those meters need to exist, which is a structural (not just promotional) advantage worth stating plainly in copy: "We can't charge you more as you grow, because there's no server counting."

## F. Sources

- [Harvest Price Increase 2026: The Agency Guide](https://trackingtime.co/time-tracking-software/harvest-price-increase-agencies.html)
- [Harvest Alternatives After the 2026 Price Increase (operating.app)](https://www.operating.app/blog-posts/harvest-alternatives-price-increase)
- [Harvest Pricing 2026 (official)](https://www.getharvest.com/pricing)
- [Harvest Pricing Review 2026 – actiTIME](https://www.actitime.com/software-collections/harvest-pricing-review)
- [Harvest Pricing 2026 | Capterra](https://www.capterra.com/p/75598/Harvest/pricing/)
- [Harvest Reviews 2026 | Capterra](https://www.capterra.com/p/75598/Harvest/reviews/)
- [Harvest Reviews | Trustpilot](https://www.trustpilot.com/review/www.getharvest.com)
- [Harvest Time Tracking Pros, Cons & Alternatives — Memtime](https://www.memtime.com/blog/harvest-time-tracking-pros-cons-alternatives-reviewed)
- [Time Tracking Software for Architects — Harvest](https://www.getharvest.com/architecture-time-tracking-software)
- [AIA Community Hub — Time tracking and reporting thread](https://communityhub.aia.org/communities/community-home/digestviewer/viewthread?GroupId=187&MID=14903&CommunityKey=79d8bdfe-0ff1-430c-b5c9-7aef1aa8fd0a)
- [9 Best Time Tracking Software for Architects — Toggl](https://toggl.com/blog/best-time-tracking-software-for-architects)
- [Top 10 Time Tracking Software for Architects — Monograph](https://monograph.com/blog/best-time-tracking-software-for-architects)
- [How to switch from Harvest to Clockify](https://clockify.me/learn/resources/moving-from-harvest-to-clockify/)
- [5 Best Reports a Harvest User Can Run — Parakeeto](https://www.parakeeto.com/blog/5-best-reports-a-harvest-user-can-run/)
- [Harvest API v2 — Time Entries](https://help.getharvest.com/api-v2/timesheets-api/timesheets/time-entries/)
- [Clockify Free Plan in 2026: What You Actually Lose vs Paid](https://flowly.run/blog/clockify-free-plan-limitations)
- [Clockify Pricing 2026: Is the Free Plan Enough? — Flowace](https://flowace.ai/blog/clockify-pricing-free-tier-vs-enterprises/)
- [Toggl Pricing 2026 — buyersprint](https://buyersprint.com/2026/05/10/toggl-pricing-2026/)
- [Best Harvest Alternatives in 2026 — HeyGopher](https://heygopher.ai/news/best-harvest-alternatives-2026)
- [6 Best Harvest Alternatives for Time Tracking 2026 — OneSuite](https://onesuite.io/blog/harvest-alternatives/)

Note: WebFetch was blocked (HTTP 403) on several official `support.getharvest.com` help-center pages, so CSV column names in Section D are best-effort/triangulated rather than a verbatim copy of Harvest's documentation — worth a manual spot-check against one real export file before finalizing the importer spec.