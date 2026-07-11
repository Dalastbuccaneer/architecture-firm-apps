// Today → "Waiting on an answer" card: open log items (RFIs, submittals,
// approvals…) of active projects that are overdue or due within 2 weeks.
// Selection lives in lib/deadlines.ts (logItemsDue); rows are buttons that
// deep-link straight to the project's Log tab. Read + navigate only — no
// editing from Today. The parent renders this card only when it has rows.

import { AlertTriangle, CalendarDays, MailQuestion } from 'lucide-react';
import type { LogItemDue } from '../../lib/deadlines';
import { capList, duePhrase, logItemOverduePhrase } from '../../lib/deadlines';
import { LOG_ITEM_TYPE_LABEL } from '../../types';

export default function OpenLogItems({
  items,
  onOpenProject,
}: {
  items: LogItemDue[];
  onOpenProject: (projectId: string) => void;
}) {
  if (items.length === 0) return null;
  const { shown, hiddenCount } = capList(items);

  return (
    <section data-e2e="today-log" className="border border-line p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <MailQuestion className="h-4 w-4" aria-hidden /> Waiting on an answer
      </h2>
      <p className="mb-3 text-ink-soft">
        Open log items due in the next 2 weeks, plus anything overdue. Click one to open its Log page.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map(({ item, projectName, daysLeft }) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpenProject(item.projectId)}
              className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left transition-colors duration-200 hover:bg-neutral-50"
            >
              <span className="min-w-0 flex-1">
                <span className="border border-line px-2 py-0.5 font-bold">{LOG_ITEM_TYPE_LABEL[item.type]}</span>{' '}
                {item.ref && <span className="text-ink-soft">{item.ref} </span>}
                <span className="font-bold">{item.subject}</span>{' '}
                <span className="text-ink-soft">· {projectName}</span>
              </span>
              {daysLeft < 0 ? (
                <span className="flex items-center gap-1.5 font-bold text-alert">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {logItemOverduePhrase(-daysLeft)}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
                  {duePhrase(daysLeft)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <p className="mt-2 text-ink-soft">…and {hiddenCount} more — see each project's Log page.</p>
      )}
    </section>
  );
}
