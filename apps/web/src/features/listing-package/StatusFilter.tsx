"use client";
// Status tabs over a list already loaded (T359, the design's list filters): each tab names a group
// of statuses with how many items are in it, and the list shows the chosen group. Filtering happens
// in the browser; the lists are one agent's or one investor's, so they are small.
import { SegmentedControl } from "@clever/ui";
import { useState } from "react";

export type StatusGroup<T> = { id: string; label: string; includes: (item: T) => boolean };

/** The chosen group's items, and the tabs that choose it. */
export function useStatusFilter<T>(items: readonly T[], groups: readonly StatusGroup<T>[]) {
  const [groupId, setGroupId] = useState(groups[0]!.id);
  const group = groups.find((g) => g.id === groupId) ?? groups[0]!;
  const tabs = (
    <SegmentedControl
      label="Filter by status"
      value={groupId}
      onChange={setGroupId}
      segments={groups.map((g) => ({
        id: g.id,
        label: `${g.label} (${items.filter(g.includes).length})`,
      }))}
    />
  );
  return { shown: items.filter(group.includes), tabs, groupLabel: group.label };
}
