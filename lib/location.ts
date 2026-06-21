import type { PatientLocation } from "@/lib/types";

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

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
    /(?:lives in|located in|residing in|from|based in|patient in)\s+([^.\n;]+)/i
  );

  if (locationLine?.[1]) {
    const parts = locationLine[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const city = parts[0];
      const state =
        parts[1].length === 2
          ? parts[1].toUpperCase()
          : parts[1];
      let country: string | null =
        parts.length >= 3 ? normalizeCountry(parts[2]) : null;

      const isUsState = US_STATE_CODES.has(state.toUpperCase());
      if (!country && isUsState) {
        country = "United States";
      }

      // Only accept when the second token is a real state code or a known
      // country. The "from" keyword otherwise grabs clinical phrases such as
      // "suffers from breast cancer, stage IV" as a bogus city/state.
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

  const countryOnly = rawText.match(
    /\b(United States|USA|U\.S\.A\.|United Kingdom|UK|Canada|Germany|France|Spain|Italy|Australia|India)\b/i
  );
  if (countryOnly) {
    return {
      city: null,
      state: null,
      country: normalizeCountry(countryOnly[1]),
    };
  }

  return null;
}

export function resolveRegistryCountry(
  location: PatientLocation | null
): string | null {
  if (!location) return null;

  if (location.state && US_STATE_CODES.has(location.state.toUpperCase())) {
    return "United States";
  }

  if (location.country && isKnownCountry(location.country)) {
    return normalizeCountry(location.country);
  }

  return null;
}

export function formatLocationDisplay(
  location: PatientLocation | null
): string | null {
  if (!location) return null;

  const parts = [
    location.city,
    location.state,
    location.country &&
    location.country.toLowerCase() !== location.city?.toLowerCase()
      ? location.country
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

const LOCAL_GEOCODE_DB: Record<string, { lat: number; lon: number }> = {
  "boston, ma, united states": { lat: 42.3601, lon: -71.0589 },
  "boston, ma": { lat: 42.3601, lon: -71.0589 },
  "boston": { lat: 42.3601, lon: -71.0589 },
  "toronto, on, canada": { lat: 43.6532, lon: -79.3832 },
  "toronto, canada": { lat: 43.6532, lon: -79.3832 },
  "toronto": { lat: 43.6532, lon: -79.3832 },
  "new york, ny, united states": { lat: 40.7128, lon: -74.0060 },
  "new york, ny": { lat: 40.7128, lon: -74.0060 },
  "new york": { lat: 40.7128, lon: -74.0060 },
  "san francisco, ca, united states": { lat: 37.7749, lon: -122.4194 },
  "san francisco, ca": { lat: 37.7749, lon: -122.4194 },
  "san francisco": { lat: 37.7749, lon: -122.4194 },
  "chicago, il, united states": { lat: 41.8781, lon: -87.6298 },
  "chicago, il": { lat: 41.8781, lon: -87.6298 },
  "chicago": { lat: 41.8781, lon: -87.6298 },
  "los angeles, ca, united states": { lat: 34.0522, lon: -118.2437 },
  "los angeles, ca": { lat: 34.0522, lon: -118.2437 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  "seattle, wa, united states": { lat: 47.6062, lon: -122.3321 },
  "seattle, wa": { lat: 47.6062, lon: -122.3321 },
  "seattle": { lat: 47.6062, lon: -122.3321 },
  "london, united kingdom": { lat: 51.5074, lon: -0.1278 },
  "london, uk": { lat: 51.5074, lon: -0.1278 },
  "london": { lat: 51.5074, lon: -0.1278 },
  "montreal, qc, canada": { lat: 45.5017, lon: -73.5673 },
  "montreal, canada": { lat: 45.5017, lon: -73.5673 },
  "montreal": { lat: 45.5017, lon: -73.5673 },
  "cambridge, ma, united states": { lat: 42.3736, lon: -71.1097 },
  "cambridge, ma": { lat: 42.3736, lon: -71.1097 },
  "cambridge": { lat: 42.3736, lon: -71.1097 },
  "worcester, ma": { lat: 42.2626, lon: -71.8023 },
  "providence, ri": { lat: 41.8240, lon: -71.4128 },
};

const geocodeCache: Record<string, { lat: number; lon: number }> = {};

// Coalesce concurrent lookups for the same place. scoreTrial runs for every
// trial via Promise.all, so without this every trial fires an identical patient
// geocode at once (thundering herd) before the cache fills.
const inFlight = new Map<string, Promise<{ lat: number; lon: number } | null>>();

// Nominatim's usage policy caps clients at ~1 request/second. Chain network
// calls through this gate so bursts of distinct sites stay under the limit and
// avoid a 429/ban.
const NOMINATIM_MIN_INTERVAL_MS = 1100;
let nominatimGate: Promise<void> = Promise.resolve();

function throttledNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimGate.then(task);
  // Advance the gate by the min interval regardless of task success/failure.
  nominatimGate = run.then(
    () => new Promise((r) => setTimeout(r, NOMINATIM_MIN_INTERVAL_MS)),
    () => new Promise((r) => setTimeout(r, NOMINATIM_MIN_INTERVAL_MS))
  );
  return run;
}

export async function geocodeLocation(
  city: string | null,
  state: string | null,
  country: string | null
): Promise<{ lat: number; lon: number } | null> {
  if (!city && !country) return null;
  const query = [city, state, country].filter(Boolean).join(", ");
  const cacheKey = query.toLowerCase();

  // 1. Check in-memory cache
  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }

  // 2. Check local offline database fallback
  if (LOCAL_GEOCODE_DB[cacheKey]) {
    return LOCAL_GEOCODE_DB[cacheKey];
  }

  // Try city name as fallback in local database
  if (city && LOCAL_GEOCODE_DB[city.toLowerCase()]) {
    return LOCAL_GEOCODE_DB[city.toLowerCase()];
  }

  // Reuse an outstanding network lookup for the same place.
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  // 3. Online fetch fallback (Nominatim), throttled and coalesced.
  const lookup = throttledNominatim(async () => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "ClinicalTrialMatcher/1.0 (contact: medical-trial-matching)",
          },
          next: { revalidate: 86400 }, // Cache on server side
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data[0]) {
          const coords = {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
          };
          geocodeCache[cacheKey] = coords;
          return coords;
        }
      }
    } catch (err) {
      console.error("Geocoding service fetch failed:", err);
    }
    return null;
  }).finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, lookup);
  return lookup;
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth's radius in miles
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
