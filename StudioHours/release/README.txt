STUDIO HOURS
Weekly timesheets, project-hours tracking, and invoicing for small architecture firms.
No signup. No cloud. Your data stays on your computer.

=====================================================================
TWO WAYS TO RUN IT
=====================================================================

OPTION A - EASIEST: double-click the file
  1. Open "StudioHours-offline.html" in Chrome or Edge (double-click it).
  2. That's the whole install. Bookmark it or keep it on your desktop.

  Notes:
  - Works in Chrome and Edge. Safari and Firefox can't save data for a
    file opened straight from disk - use Option B for those browsers.
  - Each computer keeps its own data. Staff run their own copy, export
    their week (Reports -> Export), and the manager imports the files
    on the Dashboard.

OPTION B - HOST IT (any static web host)
  1. Upload the contents of the "website" folder to any static host
     (Netlify, Cloudflare Pages, GitHub Pages, or your own server).
  2. Everyone opens the URL. It installs as an app (PWA) and works
     offline after the first visit.
  Data still lives only in each person's browser - the server just
  delivers the app, it never sees your hours.

=====================================================================
FIRST 5 MINUTES
=====================================================================
  1. Open the app -> "Explore with sample data" to poke around, or
     "Set up the firm" to start for real.
  2. Setup: add projects/phases, people, and (if you invoice) your
     Billing rates.
  3. Staff: fill the Week grid, then Reports -> Export every Friday
     and drop the file in a shared folder (or email it).
  4. Manager: Dashboard -> drag the whole folder in. Charts, phase
     budgets, and alerts update instantly.
  5. Invoices -> New invoice: pick a project and a period - the
     tracked hours become an editable invoice. Print for a PDF.

=====================================================================
IMPORTANT - BACK UP
=====================================================================
Your data lives only in the browser on your computer. Use
Settings -> Back up now regularly (it downloads one JSON file that
restores everything, invoices included).

Version: 0.1  -  Built with Studio Hours' local-first stack.
