import { describe, expect, it } from "vitest";

import { hubspotProvider } from "../../providers/hubspot.js";
import { getProvider } from "../../providers/registry.js";

describe("hubspotProvider", () => {
  it("self-registers under name 'hubspot'", () => {
    expect(getProvider("hubspot")?.name).toBe("hubspot");
  });

  it("auth URL includes scope placeholder + PKCE", () => {
    expect(hubspotProvider.authUrl).toContain("{scope}");
    expect(hubspotProvider.authUrl).toContain("{code_challenge}");
  });

  it("parses token response with expiry + refresh token", () => {
    const grant = hubspotProvider.parseTokenResponse({
      access_token: "hs-access",
      refresh_token: "hs-refresh",
      expires_in: 1800,
    });
    expect(grant.accessToken).toBe("hs-access");
    expect(grant.refreshToken).toBe("hs-refresh");
    expect(grant.expiresAt).toBeGreaterThan(0);
  });

  it("refresh response reuses previous refresh token when omitted", () => {
    const grant = hubspotProvider.refreshTokenResponse!(
      { access_token: "new", expires_in: 1800 },
      { accessToken: "old", refreshToken: "keep" },
    );
    expect(grant.refreshToken).toBe("keep");
  });
});
