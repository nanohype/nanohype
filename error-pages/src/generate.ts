import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderSitePages, type SitePages, type SitePagesOptions } from "./render.js";

/**
 * Render a site's error pages and write them into `outDir` (created if needed).
 * Point this at whatever your build publishes to the origin root — a Vite/Astro
 * `public/` for pre-build, or `dist/` for post-build. Returns the paths written.
 */
export async function writeSitePages(outDir: string, options: SitePagesOptions): Promise<string[]> {
  const pages: SitePages = renderSitePages(options);
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];
  for (const [name, contents] of Object.entries(pages)) {
    const path = join(outDir, name);
    await writeFile(path, contents, "utf8");
    written.push(path);
  }
  return written;
}
