/**
 * PII redaction — the union of the fleet's three category sets.
 *
 * One pattern catalog covering secrets/tokens (JWT, AWS access keys,
 * GitHub PATs, Slack tokens, generic API keys), financial identifiers
 * (dashed SSN, credit cards), compensation language, performance/HR-case
 * signals, health information, dates of birth, contact info (email,
 * phone, street address), AWS account ids, and customer/infrastructure
 * identifiers (customer ids, account ids, RFC1918 IPs, internal
 * hostnames).
 *
 * Patterns are ordered most-specific first so longer matches win over
 * shorter ones (e.g. AKIA access keys before generic API-key prefixes,
 * credit cards before phone numbers). Replacements are typed per label
 * (`[JWT]`, `[SSN]`, `[COMPENSATION]`, …) so redacted text stays
 * debuggable — you can see WHAT was removed without seeing the value.
 *
 * Non-dashed SSN (`\b\d{9}\b`) is intentionally NOT redacted: it collides
 * with legitimate 9-digit account numbers and would produce unacceptable
 * false positives in business text. If ever needed, use a context-aware
 * detector (label + value), not a raw regex.
 *
 * Zero dependencies.
 */

export type PiiCategory =
  | "secrets"
  | "financial"
  | "compensation"
  | "hr"
  | "health"
  | "dob"
  | "contact"
  | "aws"
  | "customer";

export interface RedactionPattern {
  category: PiiCategory;
  label: string;
  pattern: RegExp;
  replacement: string;
}

// Compensation keywords reused across the currency-agnostic patterns below.
const COMP_KEYWORD = "(?:salary|compensation|comp|pay|bonus|equity|RSUs?|raise|offer|base|stipend)";
// A monetary amount: optional currency symbol, optional magnitude/cadence suffix.
const MONEY_AMOUNT =
  "(?:[$£€¥₹]\\s?)?[\\d,]+(?:\\.\\d{1,2})?(?:\\s*(?:k|K|thousand|million|m|/\\s*year|/\\s*yr|per\\s+annum|annually))?";

export const REDACTION_PATTERNS: readonly RedactionPattern[] = [
  // ── Secrets / tokens ─────────────────────────────────────────────
  {
    category: "secrets",
    label: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[JWT]",
  },
  {
    category: "secrets",
    label: "aws_access_key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: "[AWS_KEY]",
  },
  {
    category: "secrets",
    label: "github_pat",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g,
    replacement: "[GITHUB_PAT]",
  },
  {
    category: "secrets",
    label: "slack_token",
    pattern: /\bxox[bpasr]-[A-Za-z0-9-]{10,}\b/g,
    replacement: "[SLACK_TOKEN]",
  },
  {
    category: "secrets",
    label: "api_key_generic",
    pattern: /\b(?:sk-|pk_live_|Bearer\s)[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[API_KEY]",
  },

  // ── Financial identifiers ────────────────────────────────────────
  {
    category: "financial",
    label: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN]",
  },
  {
    category: "financial",
    label: "credit_card",
    pattern:
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: "[PAYMENT]",
  },
  {
    category: "financial",
    label: "credit_card_separated",
    pattern: /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
    replacement: "[PAYMENT]",
  },

  // ── Compensation ─────────────────────────────────────────────────
  {
    category: "compensation",
    label: "amount_before_keyword",
    pattern: new RegExp(
      `[$£€¥₹]\\s?[\\d,]+(?:\\.\\d{1,2})?(?:\\s*(?:k|K|thousand|million|m))?\\s*${COMP_KEYWORD}`,
      "gi",
    ),
    replacement: "[COMPENSATION]",
  },
  {
    category: "compensation",
    label: "keyword_before_currency_amount",
    pattern: new RegExp(`${COMP_KEYWORD}\\s*(?:of|is|was|at|:)?\\s*[$£€¥₹]\\s?[\\d,]+`, "gi"),
    replacement: "[COMPENSATION]",
  },
  {
    category: "compensation",
    label: "keyword_before_bare_amount",
    pattern: new RegExp(`${COMP_KEYWORD}\\s*(?:of|is|was|at|:)?\\s*${MONEY_AMOUNT}`, "gi"),
    replacement: "[COMPENSATION]",
  },
  {
    category: "compensation",
    label: "bare_amount_before_keyword",
    pattern: new RegExp(`${MONEY_AMOUNT}\\s*${COMP_KEYWORD}`, "gi"),
    replacement: "[COMPENSATION]",
  },
  {
    category: "compensation",
    label: "annual_cadence_amount",
    pattern:
      /(?:[$£€¥₹]\s?)?[\d,]+(?:\.\d{1,2})?\s*[kKmM]?\s*(?:per\s+annum|annually|\/\s*year|\/\s*yr|per\s+year|a\s+year)\b/gi,
    replacement: "[COMPENSATION]",
  },
  {
    category: "compensation",
    label: "comp_phrase",
    pattern: /\b(?:annual|base|total)\s+(?:comp|compensation|salary|pay)\b/gi,
    replacement: "[COMPENSATION]",
  },

  // ── Performance / HR ─────────────────────────────────────────────
  { category: "hr", label: "pip", pattern: /\bPIP\b/g, replacement: "[HR]" },
  {
    category: "hr",
    label: "performance_process",
    pattern: /performance\s+(?:improvement|management|plan|review|warning)/gi,
    replacement: "[HR]",
  },
  {
    category: "hr",
    label: "disciplinary",
    pattern: /disciplinary\s+(?:action|proceeding|process)/gi,
    replacement: "[HR]",
  },
  { category: "hr", label: "written_warning", pattern: /written\s+warning/gi, replacement: "[HR]" },
  {
    category: "hr",
    label: "termination_notice",
    pattern: /termination\s+notice/gi,
    replacement: "[HR]",
  },
  {
    category: "hr",
    label: "performance_corrective",
    pattern: /performance\s+corrective/gi,
    replacement: "[HR]",
  },
  { category: "hr", label: "hr_case_id", pattern: /HR-\d+/gi, replacement: "[HR_CASE]" },
  { category: "hr", label: "case_number", pattern: /case\s+#?\d+/gi, replacement: "[HR_CASE]" },
  {
    category: "hr",
    label: "ticket_number",
    pattern: /ticket\s+#?[A-Z0-9]+/gi,
    replacement: "[HR_CASE]",
  },

  // ── Health ───────────────────────────────────────────────────────
  { category: "health", label: "fmla", pattern: /\bFMLA\b/gi, replacement: "[HEALTH]" },
  {
    category: "health",
    label: "diagnosis",
    pattern: /\bdiagnos(?:is|ed|es)\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "medical_phrase",
    pattern: /\bmedical\s+(?:leave|condition|emergency|appointment|record|history|note)\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "mental_health",
    pattern: /\bmental\s+health\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "health_phrase",
    pattern: /\bhealth\s+(?:condition|issue|concern|record|emergency)\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "term_disability",
    pattern: /\b(?:short|long)[\s-]term\s+disability\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "disability_phrase",
    pattern: /\bdisability\s+(?:accommodation|leave|claim|benefits?|status)\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "accommodation",
    pattern: /\b(?:reasonable\s+)?accommodation\s+(?:request|for)\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "leave_type",
    pattern: /\b(?:sick|medical|maternity|paternity|parental|bereavement)\s+leave\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "leave_of_absence",
    pattern: /\bleave\s+of\s+absence\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "workers_comp",
    pattern: /\bworkers?['’\s]?\s*comp(?:ensation)?\s+(?:claim|case|injury)\b/gi,
    replacement: "[HEALTH]",
  },
  {
    category: "health",
    label: "treatment_for",
    pattern: /\b(?:treatment|therapy|prescription|hospitaliz(?:ed|ation)|surgery)\s+for\b/gi,
    replacement: "[HEALTH]",
  },

  // ── Date of birth ────────────────────────────────────────────────
  {
    category: "dob",
    label: "dob_phrase",
    pattern: /\b(?:date of birth|dob|born on)\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    replacement: "[DOB]",
  },

  // ── Contact info ─────────────────────────────────────────────────
  {
    category: "contact",
    label: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[EMAIL]",
  },
  {
    category: "contact",
    label: "phone_us",
    pattern: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}\b/g,
    replacement: "[PHONE]",
  },
  {
    category: "contact",
    label: "phone_intl",
    // E.164 / international: leading "+" country code then 7-14 more digits
    // with optional space/dash/dot grouping. The required "+" keeps it from
    // matching bare digit runs handled by other patterns.
    pattern: /\+\d{1,3}(?:[\s\-.]?\d){7,14}\b/g,
    replacement: "[PHONE]",
  },
  {
    category: "contact",
    label: "street_address",
    pattern: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Court|Ct|Place|Pl)\b/gi,
    replacement: "[ADDRESS]",
  },

  // ── AWS account ──────────────────────────────────────────────────
  {
    category: "aws",
    label: "aws_account_id",
    pattern: /\b\d{12}\b(?=\s*(?:aws|account))/gi,
    replacement: "[AWS_ACCOUNT]",
  },

  // ── Customer / infrastructure identifiers ────────────────────────
  {
    category: "customer",
    label: "customer_id",
    pattern: /\bcust-[0-9]+\b/gi,
    replacement: "[CUSTOMER_ID]",
  },
  {
    category: "customer",
    label: "account_id_field",
    pattern: /\baccount[-_]?id[:=\s][^\s,]+/gi,
    replacement: "[ACCOUNT_ID]",
  },
  {
    category: "customer",
    label: "internal_ip",
    // RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
    pattern:
      /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3})\b/g,
    replacement: "[INTERNAL_IP]",
  },
  {
    category: "customer",
    label: "prod_hostname",
    pattern: /\bprod-[a-z0-9-]+\.[a-z]+\b/gi,
    replacement: "[INTERNAL_HOST]",
  },
  {
    category: "customer",
    label: "db_identifier",
    pattern: /\bdb-[a-z0-9-]+\b/gi,
    replacement: "[INTERNAL_HOST]",
  },
];

export interface PiiFinding {
  category: PiiCategory;
  label: string;
  matches: string[];
}

export class PiiDetectedError extends Error {
  constructor(
    public readonly findings: PiiFinding[],
    context?: string,
  ) {
    const labels = findings.map((f) => `${f.category}/${f.label}`).join(", ");
    super(`${context ? `[${context}] ` : ""}PII detected: ${labels}`);
    this.name = "PiiDetectedError";
  }
}

function selectPatterns(categories?: PiiCategory[]): readonly RedactionPattern[] {
  if (!categories) return REDACTION_PATTERNS;
  const wanted = new Set(categories);
  return REDACTION_PATTERNS.filter((p) => wanted.has(p.category));
}

/** Replace every match of every (selected) pattern with its typed token. */
export function redact(text: string, options?: { categories?: PiiCategory[] }): string {
  let result = text;
  for (const { pattern, replacement } of selectPatterns(options?.categories)) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Report which patterns match, without modifying the text. */
export function scan(text: string, options?: { categories?: PiiCategory[] }): PiiFinding[] {
  const findings: PiiFinding[] = [];
  for (const { category, label, pattern } of selectPatterns(options?.categories)) {
    // Fresh RegExp per scan — never share lastIndex state with redact().
    const matches = text.match(new RegExp(pattern.source, pattern.flags)) ?? [];
    if (matches.length > 0) findings.push({ category, label, matches });
  }
  return findings;
}

/** Guard for LLM prompt/output checkpoints — throws `PiiDetectedError` on any finding. */
export function assertNoPii(text: string, context?: string): void {
  const findings = scan(text);
  if (findings.length > 0) {
    throw new PiiDetectedError(findings, context);
  }
}
