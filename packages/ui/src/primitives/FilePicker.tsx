"use client";
// The file picker (T268, T353): a button that opens the file dialog through React Aria's FileTrigger,
// limited to the types the screen allows, and hands back the chosen files: photos, an investor CSV,
// or a brand's token file. It uploads nothing.
import { FileTrigger } from "react-aria-components";
import { Button } from "./Button.js";

export type FilePickerProps = {
  label: string;
  acceptedTypes: readonly string[];
  onSelect: (files: File[]) => void;
  allowsMultiple?: boolean;
  isDisabled?: boolean;
};

export function FilePicker({
  label,
  acceptedTypes,
  onSelect,
  allowsMultiple = false,
  isDisabled,
}: FilePickerProps) {
  return (
    <FileTrigger
      acceptedFileTypes={[...acceptedTypes]}
      allowsMultiple={allowsMultiple}
      onSelect={(files) => onSelect(files ? Array.from(files) : [])}
    >
      <Button variant="secondary" isDisabled={isDisabled}>
        {label}
      </Button>
    </FileTrigger>
  );
}
