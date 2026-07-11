// Generic "nothing here yet" placeholder — a centered, bordered box with a
// bold title, an optional softer hint line, and an optional action below.
// Screens compose this rather than hand-rolling their own empty states.

import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 border border-line px-6 py-12 text-center">
      <p className="font-bold">{title}</p>
      {hint && <p className="text-ink-soft">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
