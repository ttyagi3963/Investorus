"use client";
// The photo picker (T268): a button that opens the file dialog through React Aria's FileTrigger,
// limited to the types the screen allows, and hands back the chosen files. It uploads nothing.
import { FileTrigger } from "react-aria-components";
import { Button } from "./Button.js";

export type PhotoPickerProps = {
  label: string;
  acceptedTypes: readonly string[];
  onSelect: (files: File[]) => void;
  isDisabled?: boolean;
};

export function PhotoPicker({ label, acceptedTypes, onSelect, isDisabled }: PhotoPickerProps) {
  return (
    <FileTrigger
      acceptedFileTypes={[...acceptedTypes]}
      allowsMultiple
      onSelect={(files) => onSelect(files ? Array.from(files) : [])}
    >
      <Button variant="secondary" isDisabled={isDisabled}>
        {label}
      </Button>
    </FileTrigger>
  );
}
