// ── Template Rendering ──────────────────────────────────────────────
//
// Simple variable substitution engine for notification templates.
// Replaces {{variableName}} placeholders in subject and body strings
// with the corresponding values from the provided variables map.
// Unmatched placeholders are left in place.
//

import type { NotificationTemplate, Notification } from "./types.js";

/**
 * Replace all `{{key}}` placeholders in a string with values from the
 * variables map. Unmatched placeholders are preserved as-is.
 */
export function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in variables ? variables[key]! : `{{${key}}}`;
  });
}

/**
 * Render a notification template with the given variables.
 *
 * Returns a ready-to-send Notification with all `{{variable}}`
 * placeholders replaced in both subject and body.
 *
 *   const template = { name: "welcome", channel: "email", subject: "Hi {{name}}", body: "Welcome, {{name}}!" };
 *   const notification = renderTemplate(template, { name: "Alice" }, "alice@example.com");
 *   // => { channel: "email", to: "alice@example.com", subject: "Hi Alice", body: "Welcome, Alice!" }
 */
export function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, string>,
  to: string,
  from?: string,
): Notification {
  return {
    channel: template.channel,
    to,
    subject: template.subject ? interpolate(template.subject, variables) : undefined,
    body: interpolate(template.body, variables),
    from,
  };
}
