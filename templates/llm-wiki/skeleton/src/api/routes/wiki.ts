import { Hono } from "hono";
import { getConfig } from "../../config.js";
import { getStorageProvider } from "../../storage/index.js";
import { parsePage } from "../../wiki/page.js";
import { query } from "../../operations/query.js";

export const wikiRoutes = new Hono();

wikiRoutes.post("/:id/query", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ question: string; discover?: boolean }>();

  if (!body.question) {
    return c.json({ error: "Missing required field: question" }, 400);
  }

  try {
    const result = await query(tenantId, body.question, {
      fileDiscovery: body.discover,
    });
    return c.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

wikiRoutes.get("/:id/pages", async (c) => {
  const tenantId = c.req.param("id");
  const config = getConfig();
  const storage = getStorageProvider(config.WIKI_STORAGE_PROVIDER);

  try {
    const paths = await storage.listPages(tenantId);
    return c.json({ pages: paths });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

wikiRoutes.get("/:id/pages/:path{.+}", async (c) => {
  const tenantId = c.req.param("id");
  const pagePath = c.req.param("path");
  const config = getConfig();
  const storage = getStorageProvider(config.WIKI_STORAGE_PROVIDER);

  try {
    const raw = await storage.readPage(tenantId, pagePath);
    if (!raw) {
      return c.json({ error: "Page not found" }, 404);
    }

    const page = parsePage(raw);
    page.path = pagePath;
    return c.json({ page });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});
