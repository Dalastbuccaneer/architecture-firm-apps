// Activities section of Setup: rename inline, toggle billable default,
// archive (hidden from pickers elsewhere, never deleted).
import type { Activity, FirmFile } from '../../types';
import type { FirmUpdater } from './types';

export default function ActivitiesPanel({ firm, update }: { firm: FirmFile; update: FirmUpdater }) {
  const patchActivity = (activityId: string, patch: Partial<Activity>) =>
    update((draft) => {
      const a = draft.activities.find((x) => x.activityId === activityId);
      if (a) Object.assign(a, patch);
    });

  return (
    <section className="mt-10">
      <h2 className="mb-4 font-bold">Activities</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th className="py-1.5 pr-3">Activity</th>
              <th className="w-28 py-1.5 pr-3">Billable</th>
              <th className="w-28 py-1.5">Archived</th>
            </tr>
          </thead>
          <tbody>
            {firm.activities.map((activity) => (
              <tr key={activity.activityId} className={`border-b border-line ${activity.archived ? 'text-ink-soft' : ''}`}>
                <td className="py-1.5 pr-3">
                  <input
                    defaultValue={activity.name}
                    onBlur={(e) => void patchActivity(activity.activityId, { name: e.target.value })}
                    className="h-11 w-full border border-line px-2"
                    aria-label="Activity name"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    checked={activity.billableDefault}
                    onChange={(e) => void patchActivity(activity.activityId, { billableDefault: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-ink"
                    aria-label={`${activity.name || 'activity'} billable by default`}
                  />
                </td>
                <td className="py-1.5">
                  <input
                    type="checkbox"
                    checked={!!activity.archived}
                    onChange={(e) => void patchActivity(activity.activityId, { archived: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-ink"
                    aria-label={`Archive ${activity.name || 'activity'}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
