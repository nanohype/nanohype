import { describe, it, expect, vi } from "vitest";
import { createWorkOsDirectoryClient } from "./workos-directory.js";

interface RawUser {
  id: string;
  email?: string | null;
  emails?: Array<{ primary?: boolean; type?: string; value: string }>;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  state?: "active" | "suspended" | "inactive";
  custom_attributes?: Record<string, unknown>;
  created_at?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

function page(data: RawUser[], after?: string) {
  return { data, list_metadata: { after: after ?? null } };
}

const alice: RawUser = {
  id: "directory_user_alice",
  email: "alice@example.com",
  first_name: "Alice",
  last_name: "Anders",
  job_title: "Staff Engineer",
  state: "active",
  custom_attributes: { githubLogin: "alicehub", department: "Platform" },
  created_at: "2026-06-01T00:00:00.000Z",
};

const bob: RawUser = {
  id: "directory_user_bob",
  emails: [
    { primary: false, value: "bob-alias@example.com" },
    { primary: true, value: "bob@example.com" },
  ],
  first_name: "Bob",
  last_name: "Bristow",
  state: "suspended",
  custom_attributes: { slackUserId: "U0BOB" },
  created_at: "2026-01-15T00:00:00.000Z",
};

function makeClient(pages: Array<{ data: RawUser[]; list_metadata: { after: string | null } }>) {
  let call = 0;
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
    jsonResponse(pages[Math.min(call++, pages.length - 1)]),
  );
  const client = createWorkOsDirectoryClient({
    apiKey: "sk_test_123",
    directoryId: "directory_01",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, fetchImpl };
}

describe("createWorkOsDirectoryClient", () => {
  it("sends the bearer key, directory id, and page size on every request", async () => {
    const { client, fetchImpl } = makeClient([page([alice])]);

    await client.findByEmail("alice@example.com");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.workos.com/directory_users");
    expect(parsed.searchParams.get("directory")).toBe("directory_01");
    expect(parsed.searchParams.get("limit")).toBe("100");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_123");
  });

  it("follows the after cursor across pages", async () => {
    const { client, fetchImpl } = makeClient([page([bob], "cursor-2"), page([alice])]);

    const found = await client.findByEmail("alice@example.com");

    expect(found?.id).toBe("directory_user_alice");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(fetchImpl.mock.calls[1][0] as unknown as string);
    expect(secondUrl.searchParams.get("after")).toBe("cursor-2");
  });

  it("matches email case-insensitively and falls back to the primary emails[] entry", async () => {
    const { client } = makeClient([page([bob])]);

    const found = await client.findByEmail("BOB@example.com");

    expect(found).toMatchObject({
      id: "directory_user_bob",
      email: "bob@example.com",
      displayName: "Bob Bristow",
      state: "suspended",
    });
  });

  it("returns null when no user matches", async () => {
    const { client } = makeClient([page([alice, bob])]);

    await expect(client.findByEmail("nobody@example.com")).resolves.toBeNull();
  });

  it("finds users by custom attribute", async () => {
    const { client } = makeClient([page([alice, bob])]);

    const byGithub = await client.findByCustomAttribute("githubLogin", "alicehub");
    expect(byGithub?.id).toBe("directory_user_alice");
    expect(byGithub?.department).toBe("Platform");
    expect(byGithub?.title).toBe("Staff Engineer");

    await expect(client.findByCustomAttribute("githubLogin", "nobody")).resolves.toBeNull();
  });

  it("lists users created at or after the cutoff", async () => {
    const { client } = makeClient([page([alice, bob])]);

    const joiners = await client.listUsersSince(new Date("2026-05-01T00:00:00.000Z"));

    expect(joiners.map((u) => u.id)).toEqual(["directory_user_alice"]);
  });

  it("scopes group listings with the group param and maps every member", async () => {
    const { client, fetchImpl } = makeClient([page([alice, bob])]);

    const members = await client.listUsersInGroup("group_oncall");

    expect(members).toHaveLength(2);
    const url = new URL(fetchImpl.mock.calls[0][0] as unknown as string);
    expect(url.searchParams.get("group")).toBe("group_oncall");
  });

  it("throws on a non-ok response with the status in the message", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "nope" }, 401));
    const client = createWorkOsDirectoryClient({
      apiKey: "bad",
      directoryId: "directory_01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.findByEmail("alice@example.com")).rejects.toThrow(
      "WorkOS directory list failed (401 Error)",
    );
  });

  it("bounds pagination at maxPages so a misbehaving API cannot loop forever", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(page([bob], "always-more")));
    const client = createWorkOsDirectoryClient({
      apiKey: "sk_test_123",
      directoryId: "directory_01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxPages: 3,
    });

    await expect(client.findByEmail("alice@example.com")).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("falls back to custom displayName, then id, when names are absent", async () => {
    const anon: RawUser = { id: "directory_user_anon", custom_attributes: {} };
    const branded: RawUser = {
      id: "directory_user_branded",
      custom_attributes: { displayName: "The Brand" },
    };
    const { client } = makeClient([page([anon, branded])]);

    const members = await client.listUsersInGroup("group_x");

    expect(members.map((u) => u.displayName)).toEqual(["directory_user_anon", "The Brand"]);
  });

  it("excludes users without a parseable created_at from since-listings", async () => {
    const anon: RawUser = { id: "directory_user_anon" };
    const { client } = makeClient([page([anon, alice])]);

    const users = await client.listUsersSince(new Date(0));

    expect(users.map((u) => u.id)).toEqual(["directory_user_alice"]);
  });
});
