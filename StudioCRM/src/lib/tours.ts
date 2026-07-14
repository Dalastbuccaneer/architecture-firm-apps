// Guided tours (driver.js) — one per screen: Clients, Pipeline, Today, Reports,
// Settings. Steps are filtered against the live DOM before the tour starts:
// driver.js does not skip a missing `element` selector, it falls back to a
// centered dummy node and still shows the popover, which reads as a bug. So
// every step here is dropped up front if its target isn't on the page — this
// also makes the tours resilient while other screens are mid-build.

import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../tour.css';
import { getFlags, patchFlags } from '../db';
import type { View } from '../AppContext';

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

export function startClientsTour(): void {
  runTour([
    {
      selector: '[data-tour="add-client"]',
      title: 'Add your first client',
      description:
        "Start here — add an organization you work with, have worked with, or might. Once it's added, open its page to add contacts, mark one as primary, and note who introduced them if the work came in as a referral.",
    },
    {
      selector: '[data-tour="clients-export"]',
      title: "Export once you've won the work",
      description:
        "Once a client has a won opportunity, export it here to copy their details into StudioLog or StudioHours by hand — this is a one-way hand-off, nothing leaves this computer on its own.",
    },
  ]);
}

export function startPipelineTour(): void {
  runTour([
    {
      selector: '[data-tour="add-lead"]',
      title: 'Log an opportunity',
      description:
        'Every inquiry, proposal, or bid starts here. Pick the client it belongs to and give it a name — it lands in the Inquiry column, and you take it from there.',
    },
    {
      selector: '[data-tour="stage-select"]',
      title: 'Move it through the stages',
      description:
        "Change this as the opportunity progresses. Marking it Won or Lost will ask you why first — that reason is required, and it's worth writing down: it's what your fee strategy learns from later.",
    },
    {
      selector: '[data-tour="lead-dates"]',
      title: 'Watch the dates',
      description:
        "Submission and decision dates show here, with plain wording that gets more urgent as they approach — and flags them once they're overdue. Never just a color to squint at.",
    },
  ]);
}

export function startTodayTour(): void {
  runTour([
    {
      selector: '[data-tour="followups-card"]',
      title: 'The one screen worth checking daily',
      description:
        "This is it. Every follow-up you've set, across every client, shows up here — worst overdue first. Check this each morning and you won't lose track of anyone.",
    },
  ]);
}

export function startReportsTour(): void {
  runTour([
    {
      selector: '[data-tour="pipeline-value"]',
      title: 'What your pipeline turns into',
      description:
        "Value by stage: raw, weighted by how likely each opportunity is to close, and how many are sitting in each column. It fills in and sharpens as more opportunities move through.",
    },
    {
      selector: '[data-tour="win-rate-table"]',
      title: 'Win rates, once a few close',
      description:
        "As opportunities close won or lost, this breaks your win rate down by sector and by client type — handy for calibrating fees and knowing which work is worth chasing.",
    },
  ]);
}

export function startSettingsTour(): void {
  runTour([
    {
      selector: '[data-tour="backup-section"]',
      title: 'Back up now and then',
      description:
        'Your data lives only on this computer — nowhere else, no cloud copy. Back up here every so often and keep the file somewhere safe.',
    },
  ]);
}

/** Auto-start the matching tour once per install; called on view change. The
 *  fire-time DOM check means that if the user navigates away during the 400ms
 *  delay, the tour neither runs on the wrong screen nor burns its "done" flag —
 *  it simply tries again next time they land on that screen. */
export async function maybeStartTourFor(view: View): Promise<void> {
  const flags = await getFlags();

  if (view === 'clients' && !flags.tourClientsDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="add-client"]')) return; // navigated away
      startClientsTour();
      void patchFlags({ tourClientsDone: true });
    }, 400);
  } else if (view === 'pipeline' && !flags.tourPipelineDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="add-lead"]')) return; // navigated away
      startPipelineTour();
      void patchFlags({ tourPipelineDone: true });
    }, 400);
  } else if (view === 'today' && !flags.tourTodayDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="followups-card"]')) return; // navigated away
      startTodayTour();
      void patchFlags({ tourTodayDone: true });
    }, 400);
  } else if (view === 'reports' && !flags.tourReportsDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="pipeline-value"]')) return; // navigated away
      startReportsTour();
      void patchFlags({ tourReportsDone: true });
    }, 400);
  } else if (view === 'settings' && !flags.tourSettingsDone) {
    setTimeout(() => {
      if (!document.querySelector('[data-tour="backup-section"]')) return; // navigated away
      startSettingsTour();
      void patchFlags({ tourSettingsDone: true });
    }, 400);
  }
}
