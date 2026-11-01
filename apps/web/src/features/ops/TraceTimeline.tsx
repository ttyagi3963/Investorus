// The trace's timeline (T342; design 09): what happened to the package and each delivery, newest
// first, on a vertical line with a dot in the outcome's tone. The outcome is also written out, so it
// never rests on color alone.
import type { TimelineEntry } from "@clever/contracts/ops";
import type { StatusTone } from "@clever/ui";
import { Card } from "@clever/ui";
import { formatLocalTime } from "@/lib/local-time";
import { OUTCOME_LABELS, OUTCOME_TONES } from "./labels";

const DOTS: Record<StatusTone, string> = {
  draft: "text-status-draft",
  open: "text-status-open",
  "offers-in": "text-status-offers-in",
  "under-contract": "text-status-under-contract",
  closed: "text-status-closed",
  error: "text-status-error",
};

export function TraceTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Card title="Timeline">
      {entries.length === 0 && <p className="text-body text-muted">Nothing has happened yet.</p>}
      <ol className="flex flex-col">
        {entries.map((entry, index) => (
          <li key={`${entry.occurredAt}-${index}`} className="flex gap-inline-md">
            <span aria-hidden="true" className="flex flex-col items-center">
              <span
                className={`mt-inset-xs size-3 shrink-0 rounded-pill bg-current ${DOTS[OUTCOME_TONES[entry.outcome]]}`}
              />
              {index < entries.length - 1 && <span className="flex-1 border-l-2 border-default" />}
            </span>
            <div className="flex flex-col gap-stack-xs pb-inset-md">
              <span className="text-label text-heading">{entry.summary}</span>
              <span className="text-helper text-muted">
                {OUTCOME_LABELS[entry.outcome]} · {entry.actor}
              </span>
              <time dateTime={entry.occurredAt} className="text-caption text-muted">
                {formatLocalTime(entry.occurredAt)}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
