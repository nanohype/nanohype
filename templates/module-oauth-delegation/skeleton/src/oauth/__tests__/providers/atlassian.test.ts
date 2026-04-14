import { describe, expect, it } from "vitest";

import { atlassianProvider } from "../../providers/atlassian.js";
import { getProvider } from "../../providers/registry.js";

describe("atlassianProvider", () => {
  it("self-registers under name 'atlassian'", () => {
    expect(getProvider("atlassian")?.name).toBe("atlassian");
  });

  it("auth URL targets api.atlassian.com audience + PKCE", () => {
    expect(atlassianProvider.authUrl).toContain("audience=api.atlassian.com");
    expect(atlassianProvider.authUrl).toContain("{code_challenge}");
    expect(atlassianProvider.authUrl).toContain("prompt=consent");
  });

  it("default scopes include offline_access for refresh tokens", () => {
    expect(atlassianProvider.defaultScopes).toContain("offline_access");
  });

  it("parses token response with refresh token + scope", () => {
    const grant = atlassianProvider.parseTokenResponse({
      access_token: "eyJ.atlassian",
      refresh_token: "atl-refresh",
      expires_in: 3600,
      scope: "read:confluence-content.all",
    });
    expect(grant.accessToken).toBe("eyJ.atlassian");
    expect(grant.refreshToken).toBe("atl-refresh");
    expect(grant.scope).toContain("confluence-content");
  });

  it("refresh reuses previous refresh token when absent", () => {
    const grant = atlassianProvider.refreshTokenResponse!(
      { access_token: "new", expires_in: 3600 },
      { accessToken: "old", refreshToken: "keep" },
    );
    expect(grant.refreshToken).toBe("keep");
  });
});
