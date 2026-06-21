import { describe, it, expect, vi, afterEach } from "vitest";
import { geocodeLocation } from "@/lib/location";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geocodeLocation in-flight coalescing", () => {
  it("issues a single Nominatim request for concurrent identical lookups", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: "48.8566", lon: "2.3522" }],
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    // "paris" is not in the local DB, so it falls through to the network path.
    const [a, b] = await Promise.all([
      geocodeLocation("Paris", null, "France"),
      geocodeLocation("Paris", null, "France"),
    ]);

    expect(a).toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
