import { describe, expect, it } from "vitest";
import { missingSdkMessage, resolveSdkCli } from "../src/resolve.js";

describe("resolveSdkCli", () => {
  it("derives the bin path from the SDK's resolved entry", () => {
    // The shape npm produces for a normal install. Written out rather than
    // taken from a live resolve, so this fails if the SDK moves its bin —
    // which is the change that would break `npx nanohype` and nothing else.
    const resolved = resolveSdkCli(() => "/app/node_modules/@nanohype/sdk/dist/index.js");
    expect(resolved).toBe("/app/node_modules/@nanohype/sdk/dist/bin/nanohype.js");
  });

  it("follows the entry wherever it resolves, including a hoisted or linked tree", () => {
    // pnpm stores, npm workspaces and `npm link` all put the package somewhere
    // other than a flat node_modules. The bin is located relative to the entry
    // for exactly this reason, so the layout is not assumed.
    expect(
      resolveSdkCli(() => "/w/.pnpm/@nanohype+sdk@0.2.0/node_modules/@nanohype/sdk/dist/index.js"),
    ).toBe("/w/.pnpm/@nanohype+sdk@0.2.0/node_modules/@nanohype/sdk/dist/bin/nanohype.js");
  });

  it("propagates a resolution failure rather than returning a bad path", () => {
    // A wrong path would surface later as a confusing "cannot find module" from
    // node, naming a file the user never asked for. Failing here is what lets
    // the entry point print an instruction instead.
    expect(() =>
      resolveSdkCli(() => {
        throw new Error("Cannot find module '@nanohype/sdk'");
      }),
    ).toThrow(/Cannot find module/);
  });
});

describe("missingSdkMessage", () => {
  it("names the cause and both ways out", () => {
    const msg = missingSdkMessage(new Error("Cannot find module '@nanohype/sdk'"));
    expect(msg).toContain("@nanohype/sdk");
    expect(msg).toContain("npx @nanohype/sdk");
    expect(msg).toContain("Cannot find module");
  });

  it("renders a thrown object as JSON, not [object Object]", () => {
    // require.resolve throws Errors, but this is the failure path and nothing
    // on it is guaranteed. "[object Object]" is worse than useless at the
    // moment someone most needs the detail.
    const msg = missingSdkMessage({ code: "MODULE_NOT_FOUND" });
    expect(msg).toContain('{"code":"MODULE_NOT_FOUND"}');
    expect(msg).not.toContain("[object Object]");
  });

  it("survives a value JSON cannot represent", () => {
    // A cyclic object would make JSON.stringify throw, replacing the real
    // failure with a second one raised while reporting the first.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => missingSdkMessage(cyclic)).not.toThrow();
    expect(missingSdkMessage(cyclic)).toContain("[object Object]");
  });

  it("renders a thrown primitive as itself", () => {
    expect(missingSdkMessage("plain string")).toContain("plain string");
  });
});
