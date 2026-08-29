import type { PatientLocation } from "@/lib/types";

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const KNOWN_COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Australia",
  "India",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Ireland",
  "Austria",
  "Poland",
  "Brazil",
  "Mexico",
  "Japan",
  "China",
  "South Korea",
  "Singapore",
];

function normalizeCountry(value: string): string {
  return value
    .replace(/\b(usa|u\.s\.a\.|u\.s\.)\b/gi, "United States")
    .replace(/\b(uk|u\.k\.)\b/gi, "United Kingdom")
    .trim();
}

function isKnownCountry(value: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeCountry(value).toLowerCase();
  return KNOWN_COUNTRIES.some((country) => country.toLowerCase() === normalized);
}

export function parseLocationFromNotes(rawText: string): PatientLocation | null {
  const locationLine = rawText.match(
    /(?:live in|lives in|living in|located in|residing in|from|based in|patient in|location:?)\s+([^.\n;]+)/i
  );

  if (locationLine?.[1]) {
    const parts = locationLine[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const city = parts[0];
      const stateRaw = parts[1];
      const stateLower = stateRaw.toLowerCase();
      let state = stateRaw.length === 2 ? stateRaw.toUpperCase() : stateRaw;

      if (US_STATE_NAMES[stateLower]) {
        state = US_STATE_NAMES[stateLower];
      }

      let country: string | null =
        parts.length >= 3 ? normalizeCountry(parts[2]) : null;

      const isUsState = US_STATE_CODES.has(state.toUpperCase());
      if (!country && isUsState) {
        country = "United States";
      }

      if (isUsState || country || isKnownCountry(state)) {
        return { city, state, country };
      }
    }

    if (parts.length === 1 && isKnownCountry(parts[0])) {
      return { city: null, state: null, country: normalizeCountry(parts[0]) };
    }
  }

  const stateMatch = rawText.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/
  );
  if (stateMatch) {
    const city = stateMatch[1].trim();
    const state = stateMatch[2].toUpperCase();
    return {
      city,
      state,
      country: US_STATE_CODES.has(state) ? "United States" : null,
    };
  }

  const countryMatch = rawText.match(
    /\b(United States|United Kingdom|Canada|Germany|France|Spain|Italy|Australia|India|Netherlands|Belgium|Switzerland|Sweden|Norway|Denmark|Ireland|Austria|Poland|Brazil|Mexico|Japan|China|South Korea|Singapore|USA|UK)\b/i
  );
  if (countryMatch) {
    return {
      city: null,
      state: null,
      country: normalizeCountry(countryMatch[1]),
    };
  }

  return null;
}

export function formatLocationDisplay(location: PatientLocation | null): string | null {
  if (!location) return null;
  const parts = [location.city, location.state, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function resolveRegistryCountry(
  location: PatientLocation | null
): string | null {
  if (!location) return null;
  if (location.country) {
    return normalizeCountry(location.country);
  }
  if (location.state && US_STATE_CODES.has(location.state.toUpperCase())) {
    return "United States";
  }
  return null;
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

export interface GeoCoords {
  lat: number;
  lon: number;
}

const LOCATION_CACHE: Record<string, GeoCoords | null> = {
  "boston, ma, united states": { lat: 42.3601, lon: -71.0589 },
  "boston, ma": { lat: 42.3601, lon: -71.0589 },
  "boston": { lat: 42.3601, lon: -71.0589 },
  "new york, ny, united states": { lat: 40.7128, lon: -74.006 },
  "new york, ny": { lat: 40.7128, lon: -74.006 },
  "new york": { lat: 40.7128, lon: -74.006 },
  "chicago, il, united states": { lat: 41.8781, lon: -87.6298 },
  "chicago, il": { lat: 41.8781, lon: -87.6298 },
  "chicago": { lat: 41.8781, lon: -87.6298 },
  "houston, tx, united states": { lat: 29.7604, lon: -95.3698 },
  "houston, tx": { lat: 29.7604, lon: -95.3698 },
  "houston": { lat: 29.7604, lon: -95.3698 },
  "los angeles, ca, united states": { lat: 34.0522, lon: -118.2437 },
  "los angeles, ca": { lat: 34.0522, lon: -118.2437 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  "philadelphia, pa, united states": { lat: 39.9526, lon: -75.1652 },
  "philadelphia, pa": { lat: 39.9526, lon: -75.1652 },
  "columbus, oh, united states": { lat: 39.9612, lon: -82.9988 },
  "columbus, ohio, united states": { lat: 39.9612, lon: -82.9988 },
  "columbus, oh": { lat: 39.9612, lon: -82.9988 },
  "columbus": { lat: 39.9612, lon: -82.9988 },
  "london, united kingdom": { lat: 51.5074, lon: -0.1278 },
  "london": { lat: 51.5074, lon: -0.1278 },
  "paris, france": { lat: 48.8566, lon: 2.3522 },
  "paris": { lat: 48.8566, lon: 2.3522 },
  "toronto, canada": { lat: 43.6532, lon: -79.3832 },
  "toronto": { lat: 43.6532, lon: -79.3832 },
  "united states": { lat: 37.0902, lon: -95.7129 },
  "united kingdom": { lat: 55.3781, lon: -3.436 },
  "canada": { lat: 56.1304, lon: -106.3468 },
  "france": { lat: 46.2276, lon: 2.2137 },
  "germany": { lat: 51.1657, lon: 10.4515 },
  "spain": { lat: 40.4637, lon: -3.7492 },
  "italy": { lat: 41.8719, lon: 12.5674 },
};

const inFlightRequests = new Map<string, Promise<GeoCoords | null>>();

function normalizeQueryKey(
  city: string | null,
  state: string | null,
  country: string | null
): string {
  const stateNorm = state ? (US_STATE_NAMES[state.toLowerCase()] ?? state) : null;
  return [city, stateNorm, country]
    .filter(Boolean)
    .join(", ")
    .toLowerCase()
    .trim();
}

export async function geocodeLocation(
  city: string | null,
  state: string | null,
  country: string | null,
  options?: { allowNetwork?: boolean }
): Promise<GeoCoords | null> {
  const queryKey = normalizeQueryKey(city, state, country);
  if (!queryKey) return null;

  if (queryKey in LOCATION_CACHE) {
    return LOCATION_CACHE[queryKey];
  }

  const stateNorm = state ? (US_STATE_NAMES[state.toLowerCase()] ?? state) : null;
  const parts = [city, stateNorm, country].filter(Boolean);
  while (parts.length > 1) {
    parts.shift();
    const fallbackKey = parts.join(", ").toLowerCase();
    if (fallbackKey in LOCATION_CACHE) {
      return LOCATION_CACHE[fallbackKey];
    }
  }

  if (options?.allowNetwork === false) {
    return null;
  }

  if (inFlightRequests.has(queryKey)) {
    return inFlightRequests.get(queryKey)!;
  }

  const requestPromise = (async () => {
    try {
      const params = new URLSearchParams({
        q: queryKey,
        format: "json",
        limit: "1",
      });

      const response = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
        headers: {
          "User-Agent": "ClinicalTrialMatcher/1.0 (contact@example.com)",
          Accept: "application/json",
        },
        next: { revalidate: 86400 },
      });

      if (!response.ok) {
        LOCATION_CACHE[queryKey] = null;
        return null;
      }

      const data = (await response.json()) as Array<{
        lat?: string;
        lon?: string;
      }>;
      if (data.length > 0 && data[0].lat && data[0].lon) {
        const coords: GeoCoords = {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
        };
        LOCATION_CACHE[queryKey] = coords;
        return coords;
      }

      LOCATION_CACHE[queryKey] = null;
      return null;
    } catch {
      LOCATION_CACHE[queryKey] = null;
      return null;
    } finally {
      inFlightRequests.delete(queryKey);
    }
  })();

  inFlightRequests.set(queryKey, requestPromise);
  return requestPromise;
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
