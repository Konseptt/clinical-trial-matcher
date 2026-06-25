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

  // Bare-city keys for common trial-site metros and cancer hubs. The lookup
  // falls back to a city-only match, so these resolve instantly without an
  // online Nominatim call (faster scoring, no rate-limit risk). Approximate
  // metro centroids; same-name collisions resolve to the larger/listed city.
  "houston": { lat: 29.7604, lon: -95.3698 },
  "dallas": { lat: 32.7767, lon: -96.797 },
  "austin": { lat: 30.2672, lon: -97.7431 },
  "philadelphia": { lat: 39.9526, lon: -75.1652 },
  "pittsburgh": { lat: 40.4406, lon: -79.9959 },
  "atlanta": { lat: 33.749, lon: -84.388 },
  "miami": { lat: 25.7617, lon: -80.1918 },
  "denver": { lat: 39.7392, lon: -104.9903 },
  "phoenix": { lat: 33.4484, lon: -112.074 },
  "san diego": { lat: 32.7157, lon: -117.1611 },
  "portland": { lat: 45.5152, lon: -122.6784 },
  "minneapolis": { lat: 44.9778, lon: -93.265 },
  "detroit": { lat: 42.3314, lon: -83.0458 },
  "cleveland": { lat: 41.4993, lon: -81.6944 },
  "columbus": { lat: 39.9612, lon: -82.9988 },
  "nashville": { lat: 36.1627, lon: -86.7816 },
  "st. louis": { lat: 38.627, lon: -90.1994 },
  "baltimore": { lat: 39.2904, lon: -76.6122 },
  "washington": { lat: 38.9072, lon: -77.0369 },
  "san antonio": { lat: 29.4241, lon: -98.4936 },
  "san jose": { lat: 37.3382, lon: -121.8863 },
  "sacramento": { lat: 38.5816, lon: -121.4944 },
  "tampa": { lat: 27.9506, lon: -82.4572 },
  "orlando": { lat: 28.5383, lon: -81.3792 },
  "charlotte": { lat: 35.2271, lon: -80.8431 },
  "indianapolis": { lat: 39.7684, lon: -86.1581 },
  "kansas city": { lat: 39.0997, lon: -94.5786 },
  "salt lake city": { lat: 40.7608, lon: -111.891 },
  "rochester": { lat: 44.0121, lon: -92.4802 },
  "ann arbor": { lat: 42.2808, lon: -83.743 },
  "durham": { lat: 35.994, lon: -78.8986 },
  "new haven": { lat: 41.3083, lon: -72.9279 },
  "vancouver": { lat: 49.2827, lon: -123.1207 },
  "calgary": { lat: 51.0447, lon: -114.0719 },
  "ottawa": { lat: 45.4215, lon: -75.6972 },
  "edmonton": { lat: 53.5461, lon: -113.4938 },
  "paris": { lat: 48.8566, lon: 2.3522 },
  "berlin": { lat: 52.52, lon: 13.405 },
  "munich": { lat: 48.1351, lon: 11.582 },
  "madrid": { lat: 40.4168, lon: -3.7038 },
  "barcelona": { lat: 41.3851, lon: 2.1734 },
  "rome": { lat: 41.9028, lon: 12.4964 },
  "milan": { lat: 45.4642, lon: 9.19 },
  "amsterdam": { lat: 52.3676, lon: 4.9041 },
  "brussels": { lat: 50.8503, lon: 4.3517 },
  "zurich": { lat: 47.3769, lon: 8.5417 },
  "vienna": { lat: 48.2082, lon: 16.3738 },
  "stockholm": { lat: 59.3293, lon: 18.0686 },
  "copenhagen": { lat: 55.6761, lon: 12.5683 },
  "oslo": { lat: 59.9139, lon: 10.7522 },
  "dublin": { lat: 53.3498, lon: -6.2603 },
  "manchester": { lat: 53.4808, lon: -2.2426 },
  "edinburgh": { lat: 55.9533, lon: -3.1883 },
  "sydney": { lat: -33.8688, lon: 151.2093 },
  "melbourne": { lat: -37.8136, lon: 144.9631 },
  "tokyo": { lat: 35.6762, lon: 139.6503 },
  "seoul": { lat: 37.5665, lon: 126.978 },
  "singapore": { lat: 1.3521, lon: 103.8198 },
  "mumbai": { lat: 19.076, lon: 72.8777 },
  "delhi": { lat: 28.6139, lon: 77.209 },
  "bangalore": { lat: 12.9716, lon: 77.5946 },
  "são paulo": { lat: -23.5505, lon: -46.6333 },
  "sao paulo": { lat: -23.5505, lon: -46.6333 },
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
  country: string | null,
  options: { allowNetwork?: boolean } = {}
): Promise<{ lat: number; lon: number } | null> {
  // Trial scoring runs for every trial via Promise.all and every trial has
  // several sites. The Nominatim gate serializes network calls at ~1/sec, so
  // geocoding every distinct site online turned scoring into a 100s+ stall.
  // Sites pass allowNetwork:false (offline DB only); only the single patient
  // lookup keeps the online fallback.
  const allowNetwork = options.allowNetwork ?? true;

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

  if (!allowNetwork) return null;

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
