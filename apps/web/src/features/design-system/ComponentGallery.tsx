"use client";
// The style guide's components (T352): every @clever/ui component in each of its states, rendered
// with the active brand's tokens. Interactive ones work, so focus, hover, and keyboard behavior can
// be checked here.
import {
  Button,
  Card,
  CheckboxGroup,
  ConfirmDialog,
  NumberField,
  PopoverPanel,
  RadioGroup,
  SegmentedControl,
  Select,
  StatTile,
  StatusChip,
  TextField,
  Thumbnail,
  type StatusTone,
} from "@clever/ui";
import { useState, type ReactNode } from "react";

const TONES: StatusTone[] = ["draft", "open", "offers-in", "under-contract", "closed", "error"];
const OPTIONS = [
  { id: "single", label: "Single family" },
  { id: "condo", label: "Condo" },
  { id: "multi", label: "Multifamily" },
];

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-stack-sm">
      <h3 className="font-heading text-heading-xs text-heading">{title}</h3>
      <div className="flex flex-wrap items-start gap-inline-lg">{children}</div>
    </section>
  );
}

export function ComponentGallery() {
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <div className="flex flex-col gap-stack-xl">
      <Example title="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="cta">Call to action</Button>
        <Button variant="success">Success</Button>
        <Button size="sm">Small</Button>
        <Button isDisabled>Disabled</Button>
        <Button isPending>Pending</Button>
      </Example>
      <Example title="Status chips">
        {TONES.map((tone) => (
          <StatusChip key={tone} tone={tone}>
            {tone}
          </StatusChip>
        ))}
      </Example>
      <Example title="Stat tiles">
        <StatTile label="Offers" value={4} tone="open" />
        <StatTile label="Needs attention" value={1} tone="error" />
        <StatTile label="Matched investors" value={12} />
      </Example>
      <Example title="Text fields">
        <div className="w-72">
          <TextField label="Name" description="As it appears on the offer." />
        </div>
        <div className="w-72">
          <TextField
            label="Email"
            defaultValue="not-an-email"
            errorMessage="Enter an email address"
          />
        </div>
        <div className="w-72">
          <TextField label="Disabled" defaultValue="Read only" isDisabled />
        </div>
      </Example>
      <Example title="Number field and select">
        <div className="w-72">
          <NumberField label="Offer price" defaultValue={250000} />
        </div>
        <div className="w-72">
          <Select label="Property type" options={OPTIONS} defaultSelectedKey="single" />
        </div>
        <div className="w-72">
          <Select label="With an error" options={OPTIONS} errorMessage="Choose a type" />
        </div>
      </Example>
      <Example title="Choices">
        <CheckboxGroup label="Property types" options={OPTIONS} defaultValue={["condo"]} />
        <CheckboxGroup
          label="As chips"
          variant="chips"
          options={OPTIONS}
          defaultValue={["single", "multi"]}
        />
        <RadioGroup label="Financing" options={OPTIONS} defaultValue="single" />
        <SegmentedControl
          label="View"
          segments={[
            { id: "list", label: "List" },
            { id: "grid", label: "Grid" },
          ]}
          value={view}
          onChange={setView}
        />
      </Example>
      <Example title="Card, thumbnail, dialogs">
        <div className="w-80">
          <Card
            title="A card"
            description="Cards group one task's content."
            actions={<Button size="sm">Act</Button>}
          >
            <p className="text-body text-default">Body text inside a card.</p>
          </Card>
        </div>
        <Thumbnail src={null} alt="No photo yet" />
        <ConfirmDialog
          triggerLabel="Open a confirmation"
          title="Withdraw the listing?"
          message="Investors will no longer see it."
          confirmLabel="Withdraw"
          cancelLabel="Keep it"
          onConfirm={() => {}}
        />
        <PopoverPanel triggerLabel="Open a popover" panelLabel="Example popover">
          <p className="p-inset-md text-body text-default">Popover content.</p>
        </PopoverPanel>
      </Example>
    </div>
  );
}
