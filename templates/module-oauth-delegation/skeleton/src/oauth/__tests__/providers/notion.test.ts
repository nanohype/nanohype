import { describe, expect, it } from "vitest";

import { notionProvider } from "../../providers/notion.js";
import { getProvider } from "../../providers/registry.js";

describe("notionProvider", () => {
  it("self-registers under name 'notion'", () => {
    const registered = getProvider("notion");
    expect(registered).toBeDefined();
    expect(registered!.name).toBe("notion");
  });

  it("has a PKCE-ready auth URL", () => {
    expect(notionProvider.authUrl).toContain("{code_challenge}");
    expect(notionProvider.authUrl).toContain("{code_challenge_method}");
    expect(notionProvider.authUrl).toContain("{state}");
    expect(notionProvider.authUrl).toContain("{client_id}");
    expect(notionProvider.authUrl).toContain("{redirect_uri}");
    expect(notionProvider.usePkce).toBe(true);
  });

  it("parses token response with no expiry and no refresh token", () => {
    const grant = notionProvider.parseTokenResponse({
      access_token: "secret_notion_token",
      bot_id: "b1",
      workspace_id: "w1",
    });
    expect(grant.accessToken).toBe("secret_notion_token");
    expect(grant.expiresAt).toBeUndefined();
    expect(grant.refreshToken).toBeUndefined();
    expect(grant.raw).toMatchObject({ bot_id: "b1", workspace_id: "w1" });
  });
});
