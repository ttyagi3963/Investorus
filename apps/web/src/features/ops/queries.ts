// Operations' console data as React Query server state (T342; constitution XIII): the packages,
// one package's trace, why an investor was or was not matched, the deliveries, the CRM comparison,
// and the outage modes, all under `["ops", ...]`, so any action refreshes every console view.
import type { DeliveryStatus } from "@clever/contracts/events";
import type { SimulationMode, SimulationService, RetryAllInput } from "@clever/contracts/ops";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ops } from "../../lib/bff-client";

const opsKeys = {
  all: ["ops"] as const,
  packages: ["ops", "packages"] as const,
  trace: (id: string) => ["ops", "packages", id] as const,
  explanation: (id: string, investorId: string) => ["ops", "packages", id, investorId] as const,
  deliveries: (status: DeliveryStatus | undefined) => ["ops", "deliveries", status ?? "ALL"],
  crm: ["ops", "crm"] as const,
  simulations: ["ops", "simulations"] as const,
};

export function useOpsPackages() {
  return useQuery({ queryKey: opsKeys.packages, queryFn: () => ops.packages() });
}

export function usePackageTrace(id: string) {
  return useQuery({ queryKey: opsKeys.trace(id), queryFn: () => ops.trace(id) });
}

export function useMatchExplanation(id: string, investorId: string) {
  return useQuery({
    queryKey: opsKeys.explanation(id, investorId),
    queryFn: () => ops.explainMatch(id, investorId),
  });
}

export function useDeliveries(status: DeliveryStatus | undefined) {
  return useQuery({ queryKey: opsKeys.deliveries(status), queryFn: () => ops.deliveries(status) });
}

export function useCrmComparison() {
  return useQuery({ queryKey: opsKeys.crm, queryFn: () => ops.crmComparison() });
}

export function useSimulations() {
  return useQuery({ queryKey: opsKeys.simulations, queryFn: () => ops.simulations() });
}

/** An operations action: never optimistic; once the api answers, every console view refreshes. */
function useOpsAction<TResult, TInput = void>(action: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opsKeys.all }),
  });
}

export const useRetryDelivery = () => useOpsAction((id: string) => ops.retryDelivery(id));
export const useRetryAll = (input: RetryAllInput = {}) => useOpsAction(() => ops.retryAll(input));
export const useSendDigests = () => useOpsAction(() => ops.sendDigestsNow());
export const useSetSimulation = () =>
  useOpsAction(({ service, mode }: { service: SimulationService; mode: SimulationMode }) =>
    ops.setSimulation(service, mode),
  );
