"use client";
// The outage switches (T342; FR-075): one card per stand-in service (CRM, email and SMS, file
// storage) with its current mode and a React Aria radio group of the four modes, each described. A change is
// sent to the api, which tells the sandbox; the card then shows the mode the api reports back.
import {
  SIMULATION_MODES,
  SIMULATION_SERVICES,
  type SimulationMode,
  type SimulationService,
} from "@clever/contracts/ops";
import { Card, RadioGroup, StatusChip } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { MODE_LABELS, MODE_TONES, SERVICE_LABELS } from "./labels";
import { useSetSimulation, useSimulations } from "./queries";

function ServiceCard({ service, mode }: { service: SimulationService; mode: SimulationMode }) {
  const setSimulation = useSetSimulation();
  const label = SERVICE_LABELS[service];
  return (
    <Card
      title={label}
      actions={<StatusChip tone={MODE_TONES[mode]}>{MODE_LABELS[mode].label}</StatusChip>}
    >
      <RadioGroup
        label={`${label} mode`}
        hideLabel
        value={mode}
        isDisabled={setSimulation.isPending}
        onChange={(next) => setSimulation.mutate({ service, mode: next as SimulationMode })}
        options={SIMULATION_MODES.map((option) => ({
          id: option,
          label: MODE_LABELS[option].label,
          description: MODE_LABELS[option].description,
        }))}
      />
      <p role="status" className="text-helper text-muted">
        {setSimulation.data && `${label} is now ${MODE_LABELS[mode].label.toLowerCase()}.`}
      </p>
      {setSimulation.isError && (
        <ErrorNotice
          error={describeError(setSimulation.error, `The ${label} mode could not be changed.`)}
        />
      )}
    </Card>
  );
}

export function SimulationCards() {
  const { data: modes, isPending, isError, error } = useSimulations();
  return (
    <>
      {isPending && <p role="status">Loading the outage modes…</p>}
      {isError && (
        <ErrorNotice error={describeError(error, "The outage modes could not be loaded.")} />
      )}
      {modes && (
        <div className="grid items-start gap-stack-lg lg:grid-cols-3">
          {SIMULATION_SERVICES.map((service) => (
            <ServiceCard key={service} service={service} mode={modes[service]} />
          ))}
        </div>
      )}
    </>
  );
}
