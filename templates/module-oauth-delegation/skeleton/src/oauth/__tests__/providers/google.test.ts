import { describe, expect, it } from "vitest";

import { googleProvider } from "../../providers/google.js";
import { getProvider } from "../../providers/registry.js";

describe("googleProvider", () => {
  it("self-registers under name 'google'", () => {
    expect(getProvider("google")?.name).toBe("google");
  });

  it("auth URL includes offline access + consent prompt + PKCE", () => {
    expect(googleProvider.authUrl).toContain("access_type=offline");
    expect(googleProvider.authUrl).toContain("prompt=consent");
    expect(googleProvider.authUrl).toContain("{code_challenge}");
    expect(googleProvider.authUrl).toContain("{scope}");
  });

  it("parses token response with expiry and refresh token", () => {
    const before = Math.floor(Date.now() / 1000);
    const grant = googleProvider.parseTokenResponse({
      access_token: "ya29.a0AfH6...",
      refresh_token: "1//0GL...",
      expires_in: 3599,
      scope: "https://www.googleapis.com/auth/drive.readonly",
    });
    expect(grant.accessToken).toBe("ya29.a0AfH6...");
    expect(grant.refreshToken).toBe("1//0GL...");
    expect(grant.expiresAt).toBeGreaterThanOrEqual(before + 3599);
    expect(grant.scope).toContain("drive.readonly");
  });

  it("refresh response reuses previous refresh token when missing", () => {
    const previous = { accessToken: "old", refreshToken: "keep-me" };
    const grant = googleProvider.refreshTokenResponse!(
      { access_token: "new", expires_in: 3600 },
      previous,
    );
    expect(grant.accessToken).toBe("new");
    expect(grant.refreshToken).toBe("keep-me");
  });
});
