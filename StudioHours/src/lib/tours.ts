// Guided tours (driver.js) — one for staff (the Week grid), one for the
// manager (the Dashboard). Steps are filtered against the live DOM before the
// tour starts: driver.js does not skip a missing `element` selector, it falls
// back to a centered dummy node and still shows the popover, which reads as a
// bug. So every step here is dropped up front if its target isn't on the page
// — this also makes the tours resilient while other screens are mid-build.

import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../tour.css';
import { getFlags, patchFlags } from '../db';

interface StepDef {
  selector: string;
  title: string;
  description: string;
}

function buildSteps(defs: StepDef[]): DriveStep[] {
  return defs
    .filter((d) => document.querySelector(d.selector))
    .map((d) => ({
      element: d.selector,
      popover: { title: d.title, description: d.description },
    }));
}

function runTour(defs: StepDef[]): void {
  const steps = buildSteps(defs);
  if (!steps.length) return;
  driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps,
  }).drive();
}

export function startStaffTour(): void {
  runTour([
    {
      selector: '[data-tour="grid"]',
      title: 'Your week',
      description: 'Your week. Click a cell and type hours — Tab moves like a spreadsheet.',
    },
    {
      selector: '[data-tour="copy-last-week"]',
      title: 'Monday ritual',
      description: "Monday ritual: one click brings back last week's rows, zeroed.",
    },
    {
      selector: '[data-tour="cell-detail"]',
      title: 'Cell details',
      description:
        'Selected cell details: activity, notes — and the Out of Scope flag. That flag is your paper trail when clients ask for extras.',
    },
    {
      selector: '[data-tour="week-total"]',
      title: 'Weekly bar',
      description: "Aim for your weekly bar. It's a self-check, not surveillance.",
    },
    {
      selector: '[data-tour="week-tab-reports"]',
      title: 'Friday export',
      description:
        "Every Friday: open My reports — right here — then click Send to your manager and drop the file in the shared folder. That's the whole workflow.",
    },
    {
      selector: '[data-tour="nav-settings"]',
      title: 'Back up',
      description: 'Back up from Settings — up here — now and then. Your data lives only on this computer.',
    },
  ]);
}

export function startManagerTour(): void {
  const hasFirmExport = !!document.querySelector('[data-tour="firm-file-export"]');
  runTour([
    {
      selector: '[data-tour="import"]',
      title: 'Import',
      description: "Open this each week and drop your whole team's files — or the folder — in.",
    },
    {
      selector: '[data-tour="import-log"]',
      title: 'Import log',
      description: 'Every import is logged and undoable. One wrong drop never destroys history.',
    },
    {
      selector: '[data-tour="alerts-tab"]',
      title: 'Alerts',
      description: 'Phase burn, time billed, missing timesheets — the surprises, before invoicing.',
    },
    {
      selector: '[data-tour="rollup"]',
      title: 'Rollup',
      description: 'One CSV for your bookkeeper.',
    },
    {
      selector: '[data-tour="nav-invoices"]',
      title: 'Money',
      description:
        'Invoices live under Money — bill straight from tracked hours: pick a project and period, tweak the lines, print a clean PDF.',
    },
    {
      selector: '[data-tour="nav-people"]',
      title: 'People',
      description: "Your team's roster — weekly hours, billable targets, and who can manage the firm.",
    },
    hasFirmExport
      ? {
          selector: '[data-tour="firm-file-export"]',
          title: 'Firm file',
          description: 'Export the Firm File so the whole team logs against the same list.',
        }
      : {
          selector: '[data-tour="nav-setup"]',
          title: 'Setup',
          description:
            'Set up projects & phases here, then export your Firm File so the whole team logs against the same list.',
        },
  ]);
}

/** Auto-start the matching tour once per install; called on view change. The
 *  fire-time DOM check means that if the user navigates away during the 400ms
 *  delay, the tour neither runs on the wrong screen nor burns its "done" flag —
 *  it simply tries again next time they land on that screen. */
export async function maybeStartTourFor(view: 'week' | 'dashboard'): Promise<void> {
  const flags = await getFlags();
  if (view === 'week' && !flags.tourStaffDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="grid"]')) return; // navigated away
      startStaffTour();
      void patchFlags({ tourStaffDone: true });
    }, 400);
  } else if (view === 'dashboard' && !flags.tourManagerDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="import"]')) return; // navigated away
      startManagerTour();
      void patchFlags({ tourManagerDone: true });
    }, 400);
  }
}
