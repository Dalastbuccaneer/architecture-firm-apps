// One correspondence-log row: type chip, ref, party, subject, dates, status
// (word + icon), an overdue callout for open items past their due date, and
// the answer/close/reopen actions for that status.

import { AlertTriangle, CheckCircle2, Circle, XCircle } from 'lucide-react';
import type { LogItem, LogItemStatus } from '../../types';
import { LOG_ITEM_STATUS_LABEL, LOG_ITEM_TYPE_LABEL } from '../../types';
import { fullDateLabel, nowISO } from '../../lib/dates';
import { logItemOverdueDays, logItemOverduePhrase } from '../../lib/deadlines';
import { db } from '../../db';
import AnswerDialog from './AnswerDialog';

const STATUS_ICON: Record<LogItemStatus, typeof Circle> = {
  open: Circle,
  answered: CheckCircle2,
  closed: XCircle,
};

const STATUS_CLASS: Record<LogItemStatus, string> = {
  open: 'text-ink-soft',
  answered: 'text-ok',
  closed: 'text-ink-soft',
};

export default function LogItemRow({ item, today }: { item: LogItem; today: string }) {
  const overdueDays = logItemOverdueDays(item, today);
  const Icon = STATUS_ICON[item.status];

  const onClose = () => {
    const label = item.ref ? `${item.ref} — ${item.subject}` : item.subject;
    if (!window.confirm(`Close "${label}"? You can reopen it later if you need to.`)) return;
    void db.logItems.update(item.id, { status: 'closed', updatedAt: nowISO() });
  };

  const onReopen = () => {
    void db.logItems.update(item.id, { status: 'open', updatedAt: nowISO() });
  };

  return (
    <li className={`flex flex-col gap-1 border border-line p-3 ${item.status === 'closed' ? 'text-ink-soft' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="border border-line px-2 py-0.5 font-bold">{LOG_ITEM_TYPE_LABEL[item.type]}</span>
        {item.ref && <span className="text-ink-soft">{item.ref}</span>}
        <span className="font-bold">{item.party}</span>
        <span className={`flex items-center gap-1.5 ${STATUS_CLASS[item.status]}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {LOG_ITEM_STATUS_LABEL[item.status]}
        </span>
      </div>

      <p>{item.subject}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
        <span>Raised {fullDateLabel(item.dateRaised)}</span>
        {item.dueDate && <span>Due {fullDateLabel(item.dueDate)}</span>}
        {overdueDays !== null && (
          <span className="flex items-center gap-1.5 font-bold text-alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {logItemOverduePhrase(overdueDays)}
          </span>
        )}
      </div>

      {item.answer && (
        <p className="text-ink-soft">
          <span className="font-bold text-ink">Answer: </span>
          {item.answer}
        </p>
      )}
      {item.notes && <p className="text-ink-soft">{item.notes}</p>}

      <div className="mt-1 flex flex-wrap gap-2">
        {item.status === 'open' && (
          <>
            <AnswerDialog item={item} />
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 cursor-pointer border border-line px-3 py-1 transition-colors duration-200 hover:border-ink"
            >
              Close
            </button>
          </>
        )}
        {item.status === 'answered' && (
          <>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 cursor-pointer border border-line px-3 py-1 transition-colors duration-200 hover:border-ink"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onReopen}
              className="min-h-11 cursor-pointer px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              Reopen
            </button>
          </>
        )}
        {item.status === 'closed' && (
          <button
            type="button"
            onClick={onReopen}
            className="min-h-11 cursor-pointer px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            Reopen
          </button>
        )}
      </div>
    </li>
  );
}
