// One interaction card: a native <details> whose summary shows kind (word +
// icon), date, which contact/opportunity it's tied to (if any), and a body
// snippet. Open it for the full summary, the follow-up date if one was set,
// and Delete. Ported from StudioLog's NoteCard.tsx, stripped of
// attendees/photoLinks/actions — interactions have no checklist of their own;
// the "what happens next" equivalent is the linked Reminder logInteraction
// may have written, which lives (and gets ticked off) on the Reminders tab.

import { Ellipsis, HardHat, Mail, Phone, Trash2, Users } from 'lucide-react';
import type { Contact, Interaction, InteractionKind, Lead } from '../../types';
import { INTERACTION_KIND_LABEL, LEAD_STAGE_LABEL } from '../../types';
import { db } from '../../db';
import { fullDateLabel } from '../../lib/dates';

const KIND_ICON: Record<InteractionKind, typeof Users> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  site_visit: HardHat,
  other: Ellipsis,
};

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

export default function InteractionCard({
  interaction,
  contact,
  lead,
}: {
  interaction: Interaction;
  /** the contact this interaction is tied to, if any — looked up once by the
   *  tab so this card stays a pure display component */
  contact?: Contact;
  /** the opportunity this interaction is tied to, if any */
  lead?: Lead;
}) {
  const KindIcon = KIND_ICON[interaction.kind];
  const tieLabel = [contact ? `With ${contact.name}` : null, lead ? `Re: ${lead.title}` : null]
    .filter(Boolean)
    .join(' · ');

  const onDelete = () => {
    const ok = window.confirm('Delete this interaction? This cannot be undone.');
    if (!ok) return;
    void db.interactions.delete(interaction.id);
  };

  return (
    <li className="border border-line">
      <details>
        <summary className="flex min-h-11 cursor-pointer flex-col gap-1 p-3 transition-colors duration-200 hover:bg-line/40">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 border border-line px-2 py-0.5 font-bold">
              <KindIcon className="h-4 w-4 shrink-0" aria-hidden />
              {INTERACTION_KIND_LABEL[interaction.kind]}
            </span>
            <span className="text-ink-soft">{fullDateLabel(interaction.date)}</span>
          </div>
          {tieLabel !== '' && <p className="text-ink-soft">{tieLabel}</p>}
          <p className="text-ink-soft">{snippet(interaction.summary)}</p>
          {interaction.followUpDate && (
            <span className="font-bold text-warn">Follow-up set for {fullDateLabel(interaction.followUpDate)}</span>
          )}
          <span className="text-ink-soft underline underline-offset-4">Open interaction</span>
        </summary>

        <div className="flex flex-col gap-3 border-t border-line p-3">
          {contact && (
            <p>
              <span className="font-bold">Contact: </span>
              {contact.name}
              {contact.role ? ` — ${contact.role}` : ''}
            </p>
          )}

          {lead && (
            <p>
              <span className="font-bold">Opportunity: </span>
              {lead.title} ({LEAD_STAGE_LABEL[lead.stage]})
            </p>
          )}

          <p className="whitespace-pre-wrap">{interaction.summary}</p>

          {interaction.followUpDate && (
            <p className="text-warn">
              <span className="font-bold">Follow-up: </span>
              {fullDateLabel(interaction.followUpDate)} — see the Reminders tab to track it.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete interaction"
              className="flex min-h-11 cursor-pointer items-center gap-1 px-2 text-ink-soft underline underline-offset-4 transition-colors duration-200 hover:text-alert"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Delete…
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}
