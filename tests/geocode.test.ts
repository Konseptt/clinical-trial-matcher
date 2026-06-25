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

    // A made-up place not in the local DB, so it falls through to the network.
    const [a, b] = await Promise.all([
      geocodeLocation("Coalescetown", null, "Testistan"),
      geocodeLocation("Coalescetown", null, "Testistan"),
    ]);

    expect(a).toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("geocodeLocation offline mode (site lookups)", () => {
  it("never touches the network when allowNetwork is false", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: "1", lon: "2" }],
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = await geocodeLocation("Offlineville", null, "Nowhereland", {
      allowNetwork: false,
    });
    expect(r).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a known city offline without any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = await geocodeLocation("Houston", "Texas", "United States", {
      allowNetwork: false,
    });
    expect(r).toEqual({ lat: 29.7604, lon: -95.3698 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
