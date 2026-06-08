import type { AppMode } from "@/lib/types";

export const MODE_STORAGE_KEY = "clinical_mode";

export function isAppMode(value: string | null): value is AppMode {
  return value === "patient" || value === "doctor";
}

export function normalizeAppMode(value: string | null): AppMode {
  return value === "patient" ? "patient" : "doctor";
}
