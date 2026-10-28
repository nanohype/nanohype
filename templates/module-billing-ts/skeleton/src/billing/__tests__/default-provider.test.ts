import { afterEach, describe, expect, it, vi } from "vitest";
import { createBillingService, registerProvider } from "../index.js";
import { createMockProvider } from "../providers/mock.js";

// ── Default Provider ───────────────────────────────────────────────
//
// DEFAULT_PROVIDER is set when the project is scaffolded, so its value
// differs between this skeleton and every project rendered from it. The
// constant is replaced here with one each test chooses, which pins what the
// facade does with the default rather than what the default happens to be.
//

const chosen = vi.hoisted(() => ({ provider: "" }));

vi.mock("../config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config.js")>();
  return {
    ...actual,
    get DEFAULT_PROVIDER() {
      return chosen.provider;
    },
  };
});

afterEach(() => {
  chosen.provider = "";
});

describe("default provider", () => {
  it("starts DEFAULT_PROVIDER when the config names no provider", async () => {
    const init = vi.fn(async () => {});
    registerProvider("scaffolded-default", () => ({ ...createMockProvider(), init }));
    chosen.provider = "scaffolded-default";

    const billing = await createBillingService({ currency: "eur" });

    expect(billing.provider).toBe("scaffolded-default");
    expect(init).toHaveBeenCalledExactlyOnceWith({ currency: "eur" });
  });

  it("starts the provider the config names over DEFAULT_PROVIDER", async () => {
    chosen.provider = "no-such-provider";

    const billing = await createBillingService({ provider: "mock" });

    expect(billing.provider).toBe("mock");
  });

  it("fails closed when DEFAULT_PROVIDER is the mock", async () => {
    chosen.provider = "mock";

    await expect(createBillingService({})).rejects.toThrow(
      /mock payment provider .* runs only when named/,
    );
  });

  it("fails when DEFAULT_PROVIDER names no registered provider", async () => {
    chosen.provider = "unregistered-gateway";

    await expect(createBillingService({})).rejects.toThrow(
      'Payment provider "unregistered-gateway" not found',
    );
  });
});
