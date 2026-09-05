import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GatewayConfig } from "../types.js";

// ── Entry Point Tests ───────────────────────────────────────────────
//
// Validates the standalone server tail: what the listener is handed,
// and what the signal handlers do. The module runs this at import, so
// the listener and the configuration loader are stubbed and the tail's
// effects are read back from those stubs.
//
// The listener is handed a fetch handler, not an app object, so the
// only way to confirm the process serves the gateway that config
// describes — auth gate included — is to call that handler.
//

const { serveMock, loadConfigMock, closeMock } = vi.hoisted(() => ({
  serveMock: vi.fn(),
  loadConfigMock: vi.fn(),
  closeMock: vi.fn((callback: () => void) => callback()),
}));

vi.mock("@hono/node-server", () => ({ serve: serveMock }));
vi.mock("../config.js", () => ({ loadConfig: loadConfigMock }));

const ENTRY_PORT = 8123;

const entryConfig: GatewayConfig = {
  port: ENTRY_PORT,
  routes: [{ path: "/api/private/*", methods: [], upstream: "http://private:3001", auth: "jwt" }],
  jwtSecret: "entrypoint-secret",
  healthCheckEnabled: false,
  logLevel: "info",
};

type ServeOptions = { fetch: (request: Request) => Promise<Response>; port: number };
type ReadyCallback = (info: { port: number }) => void;
type SignalHandler = () => void;

let servedOptions: ServeOptions;
let ready: ReadyCallback;
let onSigterm: SignalHandler;
let onSigint: SignalHandler;

beforeAll(async () => {
  serveMock.mockReturnValue({ close: closeMock });
  loadConfigMock.mockReturnValue(entryConfig);

  const beforeTerm = process.listeners("SIGTERM");
  const beforeInt = process.listeners("SIGINT");

  await import("../index.js");

  servedOptions = serveMock.mock.calls[0]![0] as ServeOptions;
  ready = serveMock.mock.calls[0]![1] as ReadyCallback;
  onSigterm = process
    .listeners("SIGTERM")
    .filter((listener) => !beforeTerm.includes(listener))[0] as unknown as SignalHandler;
  onSigint = process
    .listeners("SIGINT")
    .filter((listener) => !beforeInt.includes(listener))[0] as unknown as SignalHandler;
});

afterAll(() => {
  process.removeListener("SIGTERM", onSigterm);
  process.removeListener("SIGINT", onSigint);
});

afterEach(() => {
  vi.restoreAllMocks();
  // `restoreAllMocks` restores spies; the hoisted listener stub is a plain
  // mock, so its call log is cleared here for the next signal.
  closeMock.mockClear();
});

describe("standalone server", () => {
  it("listens on the port the configuration names", () => {
    expect(serveMock).toHaveBeenCalledTimes(1);
    expect(servedOptions.port).toBe(ENTRY_PORT);
    expect(typeof servedOptions.fetch).toBe("function");
  });

  it("serves the gateway the configuration describes, auth gate included", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await servedOptions.fetch(new Request("http://localhost/api/private/thing"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Bearer token required",
    });
  });

  it("routes an unknown path through the gateway's own 404", async () => {
    const response = await servedOptions.fetch(new Request("http://localhost/api/absent"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Not Found",
      message: "No route matches this request",
    });
  });

  it("announces the port the listener reports as ready", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    ready({ port: ENTRY_PORT });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`listening on http://localhost:${ENTRY_PORT}`),
    );
  });
});

describe.each([
  ["SIGTERM", () => onSigterm],
  ["SIGINT", () => onSigint],
])("%s handler", (signal, handler) => {
  it("closes the listener and exits zero", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(globalThis, "setTimeout").mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setTimeout>);

    handler()();

    expect(log).toHaveBeenCalledWith(`${signal} received, shutting down...`);
    // The gateway is drained before the listener is closed: health check
    // timers stopped and circuit breakers dropped.
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Gateway shut down"));
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("arms a forced exit that does not itself hold the process open", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const unref = vi.fn();
    const timer = vi
      .spyOn(globalThis, "setTimeout")
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setTimeout>);

    handler()();

    expect(timer).toHaveBeenCalledWith(expect.any(Function), 10_000);
    expect(unref).toHaveBeenCalledTimes(1);

    const forceExit = timer.mock.calls[0]![0] as () => void;
    forceExit();

    expect(error).toHaveBeenCalledWith("Forced shutdown");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
