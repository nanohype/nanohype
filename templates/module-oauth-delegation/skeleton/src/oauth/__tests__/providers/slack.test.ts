import { describe, expect, it } from "vitest";

import { slackProvider } from "../../providers/slack.js";
import { getProvider } from "../../providers/registry.js";

describe("slackProvider", () => {
  it("self-registers under name 'slack'", () => {
    expect(getProvider("slack")?.name).toBe("slack");
  });

  it("auth URL uses user_scope (not scope) and PKCE", () => {
    expect(slackProvider.authUrl).toContain("user_scope={scope}");
    expect(slackProvider.authUrl).toContain("{code_challenge}");
  });

  it("parses token response from authed_user.access_token", () => {
    const grant = slackProvider.parseTokenResponse({
      ok: true,
      access_token: "xoxb-bot", // should be ignored
      authed_user: {
        id: "U1",
        access_token: "xoxp-user",
        refresh_token: "xoxe-refresh",
        expires_in: 43200,
        scope: "channels:read,chat:write",
      },
      team: { id: "T1" },
    });
    expect(grant.accessToken).toBe("xoxp-user");
    expect(grant.refreshToken).toBe("xoxe-refresh");
    expect(grant.scope).toContain("channels:read");
  });

  it("falls back to top-level access_token when authed_user is absent", () => {
    const grant = slackProvider.parseTokenResponse({
      ok: true,
      access_token: "xoxb-bot",
    });
    expect(grant.accessToken).toBe("xoxb-bot");
  });
});
