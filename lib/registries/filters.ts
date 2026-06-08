import { resolveRegistryCountry } from "@/lib/location";
import type { RegistryTrial } from "./types";

const RECRUITING_STATUSES = new Set([
  "RECRUITING",
  "NOT YET RECRUITING",
  "NOT_YET_RECRUITING",
  "ENROLLING BY INVITATION",
  "ENROLLING_BY_INVITATION",
  "ACTIVE NOT RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "ONGOING",
  "AUTHORISED",
  "AUTHORIZED",
  "OPEN",
]);

const EXCLUDED_STATUSES = new Set([
  "COMPLETED",
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
  "CLOSED",
  "STOPPED",
  "PREMATURELY ENDED",
  "NO LONGER RECRUITING",
]);

export function normalizeStatus(status: string): string {
  return status.trim().toUpperCase().replace(/_/g, " ");
}

export function isOpenRecruitmentStatus(status: string): boolean {
  const normalized = normalizeStatus(status);
  if (EXCLUDED_STATUSES.has(normalized)) return false;
  if (RECRUITING_STATUSES.has(normalized)) return true;

  return (
    normalized.includes("RECRUIT") ||
    normalized.includes("NOT YET RECRUIT") ||
    normalized.includes("ONGOING") ||
    normalized.includes("AUTHORIS") ||
    normalized.includes("AUTHORIZ")
  );
}

export function parsePhaseRank(phase: string): number {
  const text = phase.toUpperCase();
  if (text.includes("IV")) return 4;
  if (text.includes("III")) return 3;
  if (text.includes("II")) return 2;
  if (text.includes("I/II") || text.includes("1/2")) return 2;
  if (text.includes("II/III") || text.includes("2/3")) return 3;
  if (text.includes("I") && !text.includes("II") && !text.includes("III")) {
    return 1;
  }
  if (text.includes("0")) return 0;
  return 0;
}

export function isPhaseTwoOrAbove(phase: string): boolean {
  return parsePhaseRank(phase) >= 2;
}

export function matchesLocation(
  trial: RegistryTrial,
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null
): boolean {
  if (!location || (!location.city && !location.state && !location.country)) {
    return true;
  }

  const locText = trial.locations
    .map((l) => `${l.city} ${l.state} ${l.country}`.toLowerCase())
    .join(" ");

  const registryCountry = resolveRegistryCountry(location);
  if (registryCountry && locText.includes(registryCountry.toLowerCase())) {
    return true;
  }
  if (location.state && locText.includes(location.state.toLowerCase())) {
    return true;
  }
  if (location.city && locText.includes(location.city.toLowerCase())) {
    return true;
  }

  return trial.locations.length === 0;
}

export function applyTrialFilters(
  trials: RegistryTrial[],
  options: {
    location: {
      city: string | null;
      state: string | null;
      country: string | null;
    } | null;
    prioritizePhaseTwoPlus: boolean;
  }
): RegistryTrial[] {
  let filtered = trials.filter((trial) =>
    isOpenRecruitmentStatus(trial.status)
  );

  if (options.prioritizePhaseTwoPlus) {
    const phaseFiltered = filtered.filter((trial) =>
      isPhaseTwoOrAbove(trial.phase)
    );
    if (phaseFiltered.length > 0) {
      filtered = phaseFiltered;
    }
  }

  return filtered;
}
