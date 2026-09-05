// ── Bootstrap Validation ────────────────────────────────────────────
//
// Catches unresolved nanohype placeholders left from incomplete
// scaffolding. Runs once at startup — exits with a helpful message
// if any __PLACEHOLDER__ patterns remain in package metadata.
//

const PLACEHOLDER_RE = /__[A-Z][A-Z0-9_]*__/;

export function validateBootstrap(): void {
  // The suite runs against the project as checked in, where a placeholder that
  // was never substituted would fail every case rather than the one that
  // checks for it.
  if (process.env.VITEST) return;

  const checks: Record<string, string | undefined> = {
    "package name": process.env.npm_package_name,
    "package description": process.env.npm_package_description,
  };

  for (const [label, value] of Object.entries(checks)) {
    if (value && PLACEHOLDER_RE.test(value)) {
      console.error(
        `\n  Unresolved placeholder in ${label}: ${value}\n\n` +
          "  This project was scaffolded from a nanohype template but\n" +
          "  some variables were not replaced. Re-run the scaffolding\n" +
          "  tool or replace placeholders manually.\n",
      );
      process.exit(1);
    }
  }
}
