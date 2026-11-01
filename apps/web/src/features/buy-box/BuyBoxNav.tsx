"use client";
// The investor's other buy boxes beside the editor (T331), from the same list query as the buy
// boxes page, so they can move between boxes; the open box is marked as the current page.
import { BUY_BOX_STATUS_TONES, StatusChip } from "@clever/ui";
import Link from "next/link";
import { BUY_BOX_STATUS_LABELS, buyBoxSummary } from "./labels";
import { useBuyBoxes } from "./queries";

export function BuyBoxNav({ currentId }: { currentId: string }) {
  const { data: boxes } = useBuyBoxes();
  if (!boxes) return null;
  return (
    <nav aria-label="Your buy boxes">
      <ul className="flex flex-col gap-stack-sm">
        {boxes.map((box) => {
          const current = box.id === currentId;
          return (
            <li key={box.id}>
              <Link
                href={`/investor/buy-boxes/${box.id}`}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col gap-stack-xs rounded-card bg-card p-inset-md outline-none hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${current ? "border-2 border-selected shadow-card" : "border border-default"}`}
              >
                <span className="flex items-center justify-between gap-inline-sm">
                  <span className="text-body-lg font-semibold text-heading">{box.name}</span>
                  <StatusChip tone={BUY_BOX_STATUS_TONES[box.status]}>
                    {BUY_BOX_STATUS_LABELS[box.status]}
                  </StatusChip>
                </span>
                <span className="text-helper text-muted">{buyBoxSummary(box)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
