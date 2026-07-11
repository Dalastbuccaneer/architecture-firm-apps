// People — the roster at top level, and (for managers) the payroll-lite tabs:
// Pay, Leave, Renewals. Same sub-tab scaffold as Dashboard/Week/Money.
//
// GATE: the three people-operations tabs exist ONLY for people the app-wide
// manager rule admits (lib/access.ts) — a manager, or anyone in a legacy firm
// where nobody carries the flag. Staff reaching People via the "More" expander
// see Roster alone: no Pay/Leave/Renewals tab buttons, no hint of pay data.
// (The data itself lives in Dexie tables the firm file never touches — see the
// confidentiality contract in types.ts.)
//
// The screen chrome (title + tab bar) is print:hidden so printing a payslip
// from Pay yields just the document — same trick as the invoice editor.
import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { setFirm } from '../db';
import { managerAccess } from '../lib/access';
import PeoplePanel from '../components/setup/PeoplePanel';
import PayTab from '../components/people/PayTab';
import LeaveTab from '../components/people/LeaveTab';
import RenewalsTab from '../components/people/RenewalsTab';
import type { FirmUpdater } from '../components/setup/types';

type Tab = 'roster' | 'pay' | 'leave' | 'renewals';
const MANAGER_TABS: Array<{ id: Tab; label: string }> = [
  { id: 'roster', label: 'Roster' },
  { id: 'pay', label: 'Pay' },
  { id: 'leave', label: 'Leave' },
  { id: 'renewals', label: 'Renewals' },
];
const STAFF_TABS: Array<{ id: Tab; label: string }> = [{ id: 'roster', label: 'Roster' }];

export default function People() {
  const { firm, me, peopleRenewalsRequested, clearPeopleRenewalsRequest } = useApp();
  const [tab, setTab] = useState<Tab>('roster');

  const full = !!firm && managerAccess(firm, me);

  // "Coming up for renewal" on the Dashboard links straight here — consume the
  // one-shot request (managers only; staff never see that strip anyway).
  useEffect(() => {
    if (peopleRenewalsRequested) {
      if (full) setTab('renewals');
      clearPeopleRenewalsRequest();
    }
  }, [peopleRenewalsRequested, full, clearPeopleRenewalsRequest]);

  if (!firm) return null;

  const tabs = full ? MANAGER_TABS : STAFF_TABS;
  const activeTab: Tab = tabs.some((t) => t.id === tab) ? tab : 'roster';

  const update: FirmUpdater = async (mutate) => {
    const draft = structuredClone(firm);
    mutate(draft);
    await setFirm(draft);
  };

  return (
    <div>
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">People</h1>
        <p className="mt-1 text-ink-soft">
          {full
            ? 'Everyone at the firm — the roster, what they are paid, their leave, and every expiry date to watch.'
            : 'Everyone at the firm — names, weekly hours, and who can manage it.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-6 border-b border-line" role="tablist" aria-label="People views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-people-${t.id}`}
              aria-selected={activeTab === t.id}
              aria-controls="people-panel"
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-11 cursor-pointer items-center border-b-2 pb-2 transition-colors duration-200 ${
                activeTab === t.id ? 'border-ink font-bold' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-6" id="people-panel" role="tabpanel" aria-labelledby={`tab-people-${activeTab}`} tabIndex={0}>
        {activeTab === 'roster' && <PeoplePanel firm={firm} update={update} canEditManagerFlag={full} />}
        {full && activeTab === 'pay' && <PayTab firm={firm} />}
        {full && activeTab === 'leave' && <LeaveTab firm={firm} />}
        {full && activeTab === 'renewals' && <RenewalsTab firm={firm} />}
      </div>
    </div>
  );
}
