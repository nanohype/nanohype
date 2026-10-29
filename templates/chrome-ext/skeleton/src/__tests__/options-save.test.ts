import { describe, expect, it } from "vitest";
import type { Settings } from "../lib/storage.js";
import { type SaveDependencies, saveGatewaySettings } from "../options/save.js";

// ── Options Save Tests ──────────────────────────────────────────────
//
// The options page saves through saveGatewaySettings, handing it the two
// browser calls a save makes: the host-permission request and the storage
// write. These hand it recording stand-ins, so each assertion reads what a
// save asked Chrome for and what it stored, and hold it to resolving every
// failure into the problem the page shows rather than rejecting.
//

interface Recorder extends SaveDependencies {
  requested: string[];
  stored: Settings[];
}

function browser(overrides: Partial<SaveDependencies> = {}): Recorder {
  const requested: string[] = [];
  const stored: Settings[] = [];
  return {
    requested,
    stored,
    requestOrigin: async (origin) => {
      requested.push(origin);
      return true;
    },
    saveSettings: async (settings) => {
      stored.push(settings);
    },
    ...overrides,
  };
}

describe("saveGatewaySettings", () => {
  it("asks for the endpoint's origin and stores the endpoint without its trailing slash", async () => {
    const deps = browser();

    const outcome = await saveGatewaySettings(
      { endpoint: " http://localhost:8080/ ", route: " summaries " },
      deps,
    );

    expect(outcome).toEqual({ saved: { endpoint: "http://localhost:8080", route: "summaries" } });
    expect(deps.requested).toEqual(["http://localhost:8080/*"]);
    expect(deps.stored).toEqual([{ endpoint: "http://localhost:8080", route: "summaries" }]);
  });

  it("stores the default route when the page leaves it empty", async () => {
    const deps = browser();

    await saveGatewaySettings({ endpoint: "http://127.0.0.1:8080", route: "  " }, deps);

    expect(deps.stored).toEqual([{ endpoint: "http://127.0.0.1:8080", route: "default" }]);
  });

  it("asks for the permission before anything is awaited, inside the click's gesture", () => {
    const deps = browser();

    void saveGatewaySettings({ endpoint: "http://localhost:8080", route: "" }, deps);

    expect(deps.requested).toEqual(["http://localhost:8080/*"]);
  });

  it("refuses an endpoint off this machine without asking for it or storing it", async () => {
    const deps = browser();

    const outcome = await saveGatewaySettings(
      { endpoint: "https://gateway.example.internal", route: "" },
      deps,
    );

    expect(outcome).toEqual({ problem: expect.stringMatching(/kubectl port-forward/) });
    expect(deps.requested).toEqual([]);
    expect(deps.stored).toEqual([]);
  });

  it("stores nothing when the user denies the permission", async () => {
    const deps = browser({ requestOrigin: async () => false });

    const outcome = await saveGatewaySettings(
      { endpoint: "http://localhost:8080", route: "" },
      deps,
    );

    expect(outcome).toEqual({
      problem: "The extension needs access to the gateway endpoint to call it.",
    });
    expect(deps.stored).toEqual([]);
  });

  it("resolves a permission request that fails, as a rejection or a throw, into the problem shown", async () => {
    for (const requestOrigin of [
      async () => {
        throw new Error("Permission request rejected.");
      },
      () => {
        throw new Error("Only permissions specified in the manifest may be requested.");
      },
    ]) {
      const deps = browser({ requestOrigin });

      const outcome = await saveGatewaySettings(
        { endpoint: "http://localhost:8080", route: "" },
        deps,
      );

      expect(outcome).toEqual({
        problem: expect.stringMatching(
          /^Chrome could not ask for access to http:\/\/localhost:8080\/\*: (Permission request rejected|Only permissions)/,
        ),
      });
      expect(deps.stored).toEqual([]);
    }
  });

  it("resolves a storage write that fails into the problem shown, whatever it rejects with", async () => {
    for (const [saveSettings, shown] of [
      [
        async () => {
          throw new Error("QUOTA_BYTES quota exceeded");
        },
        "QUOTA_BYTES quota exceeded",
      ],
      [() => Promise.reject("storage is unavailable"), "storage is unavailable"],
    ] as const) {
      const outcome = await saveGatewaySettings(
        { endpoint: "http://localhost:8080", route: "" },
        browser({ saveSettings }),
      );

      expect(outcome).toEqual({ problem: `The settings could not be saved: ${shown}` });
    }
  });
});
