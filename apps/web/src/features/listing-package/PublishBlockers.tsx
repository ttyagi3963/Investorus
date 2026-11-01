// The fields that block a publish (T301), each linked to its input: on the package page the link
// jumps to the field, and from the dashboard it opens the package at that field.
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { FIELD_LABELS } from "./labels";
import type { Blockers } from "./usePublication";

export function PublishBlockers({ blockers, onPage }: { blockers: Blockers; onPage: boolean }) {
  const base = onPage ? "" : `/agent/packages/${blockers.packageId}`;
  return (
    <ErrorNotice error={{ message: "Fix these to publish:", requestId: blockers.requestId }}>
      <ul className="flex flex-col gap-stack-sm">
        {blockers.fields.map((f) => (
          <li key={f.field}>
            <a href={`${base}#${f.field}`} className="text-link underline">
              {FIELD_LABELS[f.field] ?? f.field}
            </a>
            : {f.message}
          </li>
        ))}
      </ul>
    </ErrorNotice>
  );
}
