"use client";
// A row of pill buttons that picks one view (T342), as in the operations trace's investor filter, on
// React Aria's ToggleButtonGroup: arrow keys move between the pills, the chosen one is announced as
// selected, and one is always chosen.
import { ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";
import { FOCUS_RING } from "./styles.js";

export type Segment<T extends string> = { id: T; label: string };

export type SegmentedControlProps<T extends string> = {
  /** Names the group for screen readers. */
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys: Set<Key>) => {
        const [next] = keys;
        if (next !== undefined) onChange(next as T);
      }}
      className="flex flex-wrap gap-inline-sm"
    >
      {segments.map((segment) => (
        <ToggleButton
          key={segment.id}
          id={segment.id}
          className={`${FOCUS_RING} inline-flex min-h-touch cursor-pointer items-center rounded-pill border border-default bg-card px-inset-md text-button-sm text-heading data-hovered:bg-accent-subtle data-selected:border-transparent data-selected:bg-inverse data-selected:text-inverse`}
        >
          {segment.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
