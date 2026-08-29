import type {
  MatchedTrial,
  PatientProfile,
  TreatmentHistory,
} from "@/lib/types";
import { isOpenRecruitmentStatus, normalizeStatus } from "@/lib/registries/filters";

export type ReadinessStatus =
  | "ready"
  | "upcoming"
  | "action-needed"
  | "opens-later"
  | "likely-ineligible"
  | "likely-eligible-now"
  | "not-a-match";

export interface EligibilityForecast {
  status: ReadinessStatus;
  label: string;
  summary: string;
  /** ISO yyyy-mm-dd when a date-based blocker (washout) clears, else null. */
  earliestDate: string | null;
  blockers: string[];
  actions: string[];
}

const MS_PER_DAY = 86_400_000;

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysISO(base: Date, days: number): string {
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function findTreatment(
  timeline: TreatmentHistory[] | undefined,
  name: string
): TreatmentHistory | undefined {
  if (!timeline) return undefined;
  const key = name.toLowerCase();
  return timeline.find((t) => t.name.toLowerCase() === key);
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export function formatForecastDate(iso: string): string {
  const d = parseDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function forecastTrialEligibility(
  trial: MatchedTrial,
  profile: PatientProfile,
  now: Date = new Date()
): EligibilityForecast {
  const blockers: string[] = [];
  const actions: string[] = [];
  const bd = trial.scoreBreakdown;

  // 1. Hard, registry-stated restrictions the patient profile explicitly contradicts
  const hardBlockers: string[] = [];
  if (bd.sexMatch < 0) {
    hardBlockers.push("Trial restricts enrollment by sex");
  }
  if (
    bd.stagePenalties > 0 &&
    profile.hasMetastaticDisease === false
  ) {
    hardBlockers.push("Trial appears limited to metastatic disease");
  }
  if (bd.biomarkerPenalties > 0) {
    hardBlockers.push("A required biomarker conflicts with your profile");
  }

  // 2. Washout & therapy timing
  let earliestDate: string | null = null;
  let hasActiveTherapyBlock = false;

  for (const check of trial.washoutChecks ?? []) {
    if (check.status === "eligible") continue;

    if (check.status === "unknown") {
      actions.push(
        `Add an end date for ${check.treatmentName} to confirm the ${check.requiredDays}-day washout`
      );
      continue;
    }

    const treatment = findTreatment(profile.priorTreatmentsTimeline, check.treatmentName);
    if (treatment?.ongoing) {
      hasActiveTherapyBlock = true;
      blockers.push(
        `${check.treatmentName} is ongoing; a ${check.requiredDays}-day washout is required after it ends`
      );
      continue;
    }

    const endDate = parseDate(treatment?.endDate);
    if (endDate) {
      const clears = addDaysISO(endDate, check.requiredDays);
      earliestDate = maxIso(earliestDate, clears);
      blockers.push(
        `${check.treatmentName} washout (${check.requiredDays} days) not yet met`
      );
    } else {
      actions.push(
        `Confirm timing of ${check.treatmentName} for the ${check.requiredDays}-day washout`
      );
    }
  }

  // 3. Biomarker gates failed without an explicit contradiction
  if (bd.biomarkerPenalties === 0) {
    for (const gate of trial.biomarkerGates ?? []) {
      if (gate.passed) continue;
      const unknown = gate.rules
        .filter((r) => r.status === "mismatched")
        .map((r) => `${r.marker} (${r.expected})`);
      if (unknown.length > 0) {
        actions.push(`Confirm biomarker status: ${unknown.join(", ")}`);
      }
    }
  }

  const notYetRecruiting =
    !hardBlockers.length &&
    isOpenRecruitmentStatus(trial.status) &&
    normalizeStatus(trial.status).includes("NOT YET");

  // 4. Classify into readiness categories:
  if (hardBlockers.length > 0) {
    return {
      status: "likely-ineligible",
      label: "Not a match",
      summary: hardBlockers[0] + ". Confirm with the study team before ruling it out.",
      earliestDate: null,
      blockers: hardBlockers,
      actions,
    };
  }

  if (earliestDate && earliestDate > now.toISOString().slice(0, 10)) {
    return {
      status: "upcoming",
      label: `Eligible ~${formatForecastDate(earliestDate)}`,
      summary: `Time-based criteria are projected to clear around ${formatForecastDate(
        earliestDate
      )}.`,
      earliestDate,
      blockers,
      actions,
    };
  }

  if (hasActiveTherapyBlock) {
    return {
      status: "action-needed",
      label: "Action needed",
      summary:
        "An ongoing therapy must end before the washout clock starts. Discuss timing with your care team.",
      earliestDate: null,
      blockers,
      actions,
    };
  }

  if (notYetRecruiting) {
    return {
      status: "opens-later",
      label: "Opens later",
      summary: "This study is not yet recruiting. Check back, or ask to be notified when it opens.",
      earliestDate: null,
      blockers,
      actions,
    };
  }

  if (actions.length > 0) {
    return {
      status: "action-needed",
      label: "Action needed",
      summary: "A few details would confirm whether you qualify.",
      earliestDate: null,
      blockers,
      actions,
    };
  }

  return {
    status: "ready",
    label: "Likely eligible now",
    summary: "Strong match to known criteria with no known disqualifying factors and actively recruiting.",
    earliestDate: null,
    blockers,
    actions,
  };
}

export interface ForecastTotals {
  ready: number;
  upcoming: number;
  actionNeeded: number;
  opensLater: number;
  likelyIneligible: number;
  nextDate: string | null;
}

export function summarizeForecasts(
  forecasts: EligibilityForecast[]
): ForecastTotals {
  const totals: ForecastTotals = {
    ready: 0,
    upcoming: 0,
    actionNeeded: 0,
    opensLater: 0,
    likelyIneligible: 0,
    nextDate: null,
  };

  for (const f of forecasts) {
    switch (f.status) {
      case "ready":
      case "likely-eligible-now":
        totals.ready++;
        break;
      case "upcoming":
        totals.upcoming++;
        if (f.earliestDate) {
          totals.nextDate =
            totals.nextDate && totals.nextDate <= f.earliestDate
              ? totals.nextDate
              : f.earliestDate;
        }
        break;
      case "action-needed":
        totals.actionNeeded++;
        break;
      case "opens-later":
        totals.opensLater++;
        break;
      case "likely-ineligible":
      case "not-a-match":
        totals.likelyIneligible++;
        break;
    }
  }

  return totals;
}
