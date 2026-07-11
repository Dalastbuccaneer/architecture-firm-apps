// Pure logic behind the Today screen's deadline list — no Dexie, no React, so
// it is unit-testable straight from Node (see test-deadlines.mjs at the repo
// root). The Today agent should extend THIS file for new aggregations (log-item
// due dates, task due dates) and keep the screen components thin.
//
// The './dates.ts' import carries its extension on purpose: Node's native
// type-stripping (which runs the unit test) resolves relative .ts imports only
// when they are explicit. Vite and tsc both accept it (allowImportingTsExtensions).

import type { LogItem, Note, Project, Stage, Task } from '../types';
import { daysBetween } from './dates.ts';

/** How far ahead the Today screen looks, in days. */
export const DEADLINE_HORIZON_DAYS = 28;

export interface StageDeadline {
  projectId: string;
  projectName: string;
  projectNumber?: string;
  stage: Stage;
  /** negative = overdue by that many days */
  daysLeft: number;
}

/** Stage deadlines worth showing today: stages of ACTIVE projects that have an
 *  end date and aren't done, falling within `horizonDays` — plus every overdue
 *  one, however old. Sorted soonest (most overdue) first, ties by project name
 *  then stageIndex so the order is stable. */
export function stageDeadlines(
  projects: Project[],
  today: string,
  horizonDays: number = DEADLINE_HORIZON_DAYS,
): StageDeadline[] {
  const out: StageDeadline[] = [];
  for (const p of projects) {
    if (p.status !== 'active') continue;
    for (const s of p.stages) {
      if (!s.endDate || s.status === 'done') continue;
      const daysLeft = daysBetween(today, s.endDate);
      if (daysLeft > horizonDays) continue;
      out.push({
        projectId: p.projectId,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        stage: s,
        daysLeft,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.daysLeft - b.daysLeft ||
      a.projectName.localeCompare(b.projectName) ||
      a.stage.stageIndex - b.stage.stageIndex,
  );
}

/** Plain-language due phrase: "Overdue by 3 days" / "Due today" / "Due in 5 days". */
export function duePhrase(daysLeft: number): string {
  if (daysLeft < 0) return `Overdue by ${-daysLeft} day${daysLeft === -1 ? '' : 's'}`;
  if (daysLeft === 0) return 'Due today';
  return `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

// ---- log-item overdue (used by the Log tab and, later, Today) -----------------

/** Days a log item is overdue by, or null when it isn't. Only OPEN items with
 *  a dueDate strictly before `today` count — answered/closed items are
 *  resolved (never overdue), a missing dueDate can't be overdue, and a due
 *  date of today isn't overdue yet (see duePhrase's "Due today"). */
export function logItemOverdueDays(
  item: Pick<LogItem, 'status' | 'dueDate'>,
  today: string,
): number | null {
  if (item.status !== 'open' || !item.dueDate || item.dueDate >= today) return null;
  return daysBetween(item.dueDate, today);
}

/** Plain-language overdue phrase for a log item: "OVERDUE by 3 days". Callers
 *  should only call this when logItemOverdueDays returned a number. */
export function logItemOverduePhrase(days: number): string {
  return `OVERDUE by ${days} day${days === 1 ? '' : 's'}`;
}

// ---- task overdue (used by the Tasks tab and, later, Today) --------------------

/** Days a task is overdue by, or null when it isn't. Only NOT-done tasks with
 *  a due date strictly before `today` count — a done task is never overdue
 *  however late it was finished, a task without a due date can't be overdue,
 *  and a task due today isn't overdue yet (see duePhrase's "Due today"). */
export function taskOverdueDays(task: Pick<Task, 'done' | 'due'>, today: string): number | null {
  if (task.done || !task.due || task.due >= today) return null;
  return daysBetween(task.due, today);
}

/** Plain-language overdue phrase for a task: "OVERDUE by 3 days". Callers
 *  should only call this when taskOverdueDays returned a number. */
export function taskOverduePhrase(days: number): string {
  return `OVERDUE by ${days} day${days === 1 ? '' : 's'}`;
}

// ---- Today-screen aggregation (Monday-morning triage) ---------------------------
//
// One consistent rule set for what "needs attention this week", shared by the
// screen and the unit test. Stages look 4 weeks out (DEADLINE_HORIZON_DAYS);
// log items and tasks look 2 weeks out (ITEM_HORIZON_DAYS); everything overdue
// surfaces however old it is. Only ACTIVE projects are watched — same rule as
// stageDeadlines — except firm-level tasks (no projectId), which always count.

/** How far ahead Today looks for log items and tasks, in days (~2 weeks). */
export const ITEM_HORIZON_DAYS = 14;

/** Longest list Today shows before folding the rest into "and N more". */
export const TODAY_LIST_CAP = 8;

export interface LogItemDue {
  item: LogItem;
  projectName: string;
  /** negative = overdue by that many days */
  daysLeft: number;
}

export interface OpenTask {
  task: Task;
  /** absent for firm-level tasks (no projectId) */
  projectName?: string;
}

export interface TaskDue extends OpenTask {
  /** negative = overdue by that many days */
  daysLeft: number;
}

export interface OpenFollowUp {
  noteId: string;
  noteTitle: string;
  noteDate: string;
  projectId: string;
  projectName: string;
  actionId: string;
  text: string;
}

/** projectId → projectName for ACTIVE projects only. */
function activeProjectNames(projects: Project[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const p of projects) if (p.status === 'active') names.set(p.projectId, p.projectName);
  return names;
}

/** Open log items of active projects that are overdue (however old) or due
 *  within `horizonDays`. Items without a due date never surface here — they
 *  live on the project's Log tab. Sorted most-overdue first, ties by project
 *  name then subject so the order is stable. */
export function logItemsDue(
  projects: Project[],
  logItems: LogItem[],
  today: string,
  horizonDays: number = ITEM_HORIZON_DAYS,
): LogItemDue[] {
  const names = activeProjectNames(projects);
  const out: LogItemDue[] = [];
  for (const item of logItems) {
    if (item.status !== 'open' || !item.dueDate) continue;
    const projectName = names.get(item.projectId);
    if (projectName === undefined) continue; // project on hold / closed
    const daysLeft = daysBetween(today, item.dueDate);
    if (daysLeft > horizonDays) continue;
    out.push({ item, projectName, daysLeft });
  }
  return out.sort(
    (a, b) =>
      a.daysLeft - b.daysLeft ||
      a.projectName.localeCompare(b.projectName) ||
      a.item.subject.localeCompare(b.item.subject),
  );
}

/** Open tasks worth showing today, split into two groups: `dated` = due within
 *  `horizonDays` or overdue (most-overdue first, ties by title), and `undated`
 *  = open tasks with no due date (the quieter group, sorted by title). Tasks of
 *  on-hold/closed projects are skipped; firm-level tasks always count. */
export function tasksDue(
  projects: Project[],
  tasks: Task[],
  today: string,
  horizonDays: number = ITEM_HORIZON_DAYS,
): { dated: TaskDue[]; undated: OpenTask[] } {
  const names = activeProjectNames(projects);
  const dated: TaskDue[] = [];
  const undated: OpenTask[] = [];
  for (const task of tasks) {
    if (task.done) continue;
    const projectName = task.projectId === undefined ? undefined : names.get(task.projectId);
    if (task.projectId !== undefined && projectName === undefined) continue; // project on hold / closed
    if (!task.due) {
      undated.push({ task, projectName });
      continue;
    }
    const daysLeft = daysBetween(today, task.due);
    if (daysLeft > horizonDays) continue;
    dated.push({ task, projectName, daysLeft });
  }
  dated.sort((a, b) => a.daysLeft - b.daysLeft || a.task.title.localeCompare(b.task.title));
  undated.sort((a, b) => a.task.title.localeCompare(b.task.title));
  return { dated, undated };
}

/** Every not-done follow-up action across the notes of active projects, one
 *  row per action. Oldest note first (it has waited longest), ties by note
 *  title; actions keep their in-note order (Array.sort is stable). */
export function openFollowUps(projects: Project[], notes: Note[]): OpenFollowUp[] {
  const names = activeProjectNames(projects);
  const out: OpenFollowUp[] = [];
  for (const note of notes) {
    const projectName = names.get(note.projectId);
    if (projectName === undefined) continue; // project on hold / closed
    for (const action of note.actions) {
      if (action.done) continue;
      out.push({
        noteId: note.id,
        noteTitle: note.title,
        noteDate: note.date,
        projectId: note.projectId,
        projectName,
        actionId: action.id,
        text: action.text,
      });
    }
  }
  return out.sort((a, b) => a.noteDate.localeCompare(b.noteDate) || a.noteTitle.localeCompare(b.noteTitle));
}

/** Everything the Today screen surfaces, computed in one place so the screen
 *  just renders it and the unit test exercises the same object. */
export interface TodaySurface {
  stages: StageDeadline[];
  logItems: LogItemDue[];
  datedTasks: TaskDue[];
  undatedTasks: OpenTask[];
  followUps: OpenFollowUp[];
}

export function todaySurface(
  projects: Project[],
  logItems: LogItem[],
  tasks: Task[],
  notes: Note[],
  today: string,
): TodaySurface {
  const t = tasksDue(projects, tasks, today);
  return {
    stages: stageDeadlines(projects, today),
    logItems: logItemsDue(projects, logItems, today),
    datedTasks: t.dated,
    undatedTasks: t.undated,
    followUps: openFollowUps(projects, notes),
  };
}

/** The all-clear predicate: nothing surfaced from ANY source (undated open
 *  tasks count — they are still shown, so the screen can't claim all-clear
 *  over them). The caller must separately check that projects exist at all;
 *  with zero projects the screen shows the first-run pointer instead. */
export function isAllClear(surface: TodaySurface): boolean {
  return (
    surface.stages.length === 0 &&
    surface.logItems.length === 0 &&
    surface.datedTasks.length === 0 &&
    surface.undatedTasks.length === 0 &&
    surface.followUps.length === 0
  );
}

/** First `cap` items plus how many were folded away — the "and N more" line. */
export function capList<T>(items: T[], cap: number = TODAY_LIST_CAP): { shown: T[]; hiddenCount: number } {
  if (items.length <= cap) return { shown: items, hiddenCount: 0 };
  return { shown: items.slice(0, cap), hiddenCount: items.length - cap };
}
