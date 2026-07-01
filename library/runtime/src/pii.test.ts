import { describe, it, expect } from "vitest";
import { redact, scan, assertNoPii, PiiDetectedError, REDACTION_PATTERNS } from "./pii.js";

describe("secrets", () => {
  it("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redact(`token ${jwt} leaked`)).toBe("token [JWT] leaked");
  });

  it("redacts AWS access key ids (AKIA and ASIA)", () => {
    expect(redact("key AKIAIOSFODNN7EXAMPLE in logs")).toBe("key [AWS_KEY] in logs");
    expect(redact("sts key ASIAIOSFODNN7EXAMPLE")).toBe("sts key [AWS_KEY]");
  });

  it("redacts GitHub PATs", () => {
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBe("[GITHUB_PAT]");
  });

  it("redacts Slack tokens", () => {
    expect(redact("xoxb-123456789012-abcdefGHIJKL")).toBe("[SLACK_TOKEN]");
  });

  it("redacts generic API keys (sk-, pk_live_, Bearer)", () => {
    expect(redact("sk-abcdefghijklmnopqrstuvwxyz")).toBe("[API_KEY]");
    expect(redact("pk_live_abcdefghijklmnopqrst")).toBe("[API_KEY]");
    expect(redact("Authorization: Bearer abcdefghijklmnopqrstuv")).toBe("Authorization: [API_KEY]");
  });
});

describe("financial identifiers", () => {
  it("redacts dashed SSNs", () => {
    expect(redact("ssn 123-45-6789 on file")).toBe("ssn [SSN] on file");
  });

  it("does NOT redact non-dashed 9-digit runs (deliberate false-positive guard)", () => {
    expect(redact("order 123456789 shipped")).toBe("order 123456789 shipped");
  });

  it("redacts scheme-valid card numbers", () => {
    expect(redact("visa 4111111111111111")).toBe("visa [PAYMENT]");
    expect(redact("mc 5500005555555559")).toBe("mc [PAYMENT]");
    expect(redact("amex 340000000000009")).toBe("amex [PAYMENT]");
  });

  it("redacts separator-grouped card numbers", () => {
    expect(redact("card 4111 1111 1111 1111 charged")).toBe("card [PAYMENT] charged");
    expect(redact("card 4111-1111-1111-1111 charged")).toBe("card [PAYMENT] charged");
  });
});

describe("compensation", () => {
  it("redacts currency amounts adjacent to comp keywords (both orders)", () => {
    expect(redact("her $150,000 base")).toContain("[COMPENSATION]");
    expect(redact("salary of £80,000 agreed")).toContain("[COMPENSATION]");
    expect(redact("€90k bonus this year")).toContain("[COMPENSATION]");
  });

  it("redacts bare-number amounts adjacent to comp keywords", () => {
    expect(redact("base 95k for the role")).toContain("[COMPENSATION]");
    expect(redact("bonus 12000 approved")).toContain("[COMPENSATION]");
  });

  it("redacts annual-cadence amounts regardless of keyword", () => {
    expect(redact("she makes 120k annually")).toContain("[COMPENSATION]");
    expect(redact("£80,000 per year offer")).toContain("[COMPENSATION]");
  });

  it("redacts comp phrases", () => {
    expect(redact("discussed total comp at the offsite")).toContain("[COMPENSATION]");
  });
});

describe("performance / HR", () => {
  it("redacts PIP mentions (uppercase only)", () => {
    expect(redact("moved to a PIP last month")).toBe("moved to a [HR] last month");
    expect(redact("pipeline pip install")).toBe("pipeline pip install");
  });

  it("redacts performance-process phrases", () => {
    expect(redact("on a performance improvement plan")).toContain("[HR]");
    expect(redact("pending disciplinary action")).toContain("[HR]");
    expect(redact("issued a written warning")).toContain("[HR]");
    expect(redact("sent the termination notice")).toContain("[HR]");
    expect(redact("performance corrective steps")).toContain("[HR]");
  });

  it("redacts HR case, case-number, and ticket identifiers", () => {
    expect(redact("see HR-4821 for details")).toBe("see [HR_CASE] for details");
    expect(redact("escalated case #1234")).toBe("escalated [HR_CASE]");
    expect(redact("tracked in ticket #ABC123")).toBe("tracked in [HR_CASE]");
  });
});

describe("health", () => {
  it("redacts strong standalone signals", () => {
    expect(redact("approved FMLA request")).toBe("approved [HEALTH] request");
    expect(redact("she was diagnosed recently")).toBe("she was [HEALTH] recently");
  });

  it("redacts medical/health phrases", () => {
    expect(redact("out on medical leave")).toContain("[HEALTH]");
    expect(redact("a mental health day")).toContain("[HEALTH]");
    expect(redact("ongoing health condition")).toContain("[HEALTH]");
    expect(redact("short-term disability paperwork")).toContain("[HEALTH]");
    expect(redact("disability accommodation approved")).toContain("[HEALTH]");
    expect(redact("accommodation request filed")).toContain("[HEALTH]");
    expect(redact("on parental leave until June")).toContain("[HEALTH]");
    expect(redact("took a leave of absence")).toContain("[HEALTH]");
    expect(redact("workers comp claim filed")).toContain("[HEALTH]");
    expect(redact("in therapy for burnout")).toContain("[HEALTH]");
  });

  it("leaves benign words alone", () => {
    expect(redact("the health of the service improved")).toBe("the health of the service improved");
    expect(redact("please leave feedback")).toBe("please leave feedback");
  });
});

describe("date of birth", () => {
  it("redacts labeled DOB values", () => {
    expect(redact("DOB: 01/02/1990")).toBe("[DOB]");
    expect(redact("date of birth 1-2-90 confirmed")).toBe("[DOB] confirmed");
    expect(redact("born on 12/31/1985")).toBe("[DOB]");
  });

  it("leaves unlabeled dates alone", () => {
    expect(redact("shipped on 01/02/2026")).toBe("shipped on 01/02/2026");
  });
});

describe("contact info", () => {
  it("redacts emails", () => {
    expect(redact("ping alice@example.com please")).toBe("ping [EMAIL] please");
  });

  it("redacts US phone numbers", () => {
    expect(redact("call 415-555-1234 now")).toBe("call [PHONE] now");
    expect(redact("call (415) 555-1234 now")).toBe("call ([PHONE] now");
  });

  it("redacts international phone numbers", () => {
    expect(redact("mobile +44 20 7946 0958")).toBe("mobile [PHONE]");
    expect(redact("or +919876543210")).toBe("or [PHONE]");
  });

  it("redacts street addresses", () => {
    expect(redact("lives at 742 Evergreen Way")).toBe("lives at [ADDRESS]");
  });
});

describe("aws account ids", () => {
  it("redacts 12-digit runs followed by aws/account context", () => {
    expect(redact("123456789012 aws")).toBe("[AWS_ACCOUNT] aws");
    expect(redact("in 123456789012 account")).toBe("in [AWS_ACCOUNT] account");
  });

  it("leaves context-free 12-digit runs alone", () => {
    expect(redact("tracking 123456789012 arrived")).toBe("tracking 123456789012 arrived");
  });
});

describe("customer / infrastructure identifiers", () => {
  it("redacts customer ids", () => {
    expect(redact("affects cust-99231 only")).toBe("affects [CUSTOMER_ID] only");
  });

  it("redacts account-id fields", () => {
    expect(redact("account_id:ac-4451 flagged")).toBe("[ACCOUNT_ID] flagged");
    expect(redact("account-id=xyz9")).toBe("[ACCOUNT_ID]");
  });

  it("redacts RFC1918 addresses and leaves public ones", () => {
    expect(redact("pod at 10.0.12.5 crashed")).toBe("pod at [INTERNAL_IP] crashed");
    expect(redact("node 172.20.1.9 drained")).toBe("node [INTERNAL_IP] drained");
    expect(redact("gw 192.168.1.1 up")).toBe("gw [INTERNAL_IP] up");
    expect(redact("resolver 8.8.8.8 fine")).toBe("resolver 8.8.8.8 fine");
    expect(redact("host 172.15.0.1 is public")).toBe("host 172.15.0.1 is public");
  });

  it("redacts prod hostnames and db identifiers", () => {
    expect(redact("on prod-api-7.internal now")).toBe("on [INTERNAL_HOST] now");
    expect(redact("failing over db-orders-primary")).toBe("failing over [INTERNAL_HOST]");
  });
});

describe("redact", () => {
  it("handles mixed text in one pass", () => {
    const input =
      "IC update: cust-441 (contact bob@example.com, +1 415-555-0100) hit by db-users-3 at 10.1.2.3; " +
      "key AKIAIOSFODNN7EXAMPLE rotated, see HR-77 and case #12";
    const output = redact(input);

    expect(output).not.toContain("bob@example.com");
    expect(output).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(output).not.toContain("cust-441");
    expect(output).not.toContain("10.1.2.3");
    expect(output).toContain("[EMAIL]");
    expect(output).toContain("[PHONE]");
    expect(output).toContain("[AWS_KEY]");
    expect(output).toContain("[CUSTOMER_ID]");
    expect(output).toContain("[INTERNAL_HOST]");
    expect(output).toContain("[INTERNAL_IP]");
    expect(output).toContain("[HR_CASE]");
  });

  it("restricts to the requested categories", () => {
    const input = "email alice@example.com token xoxb-123456789012-abcdefGHIJKL";

    const secretsOnly = redact(input, { categories: ["secrets"] });
    expect(secretsOnly).toContain("alice@example.com");
    expect(secretsOnly).toContain("[SLACK_TOKEN]");

    const contactOnly = redact(input, { categories: ["contact"] });
    expect(contactOnly).toContain("[EMAIL]");
    expect(contactOnly).toContain("xoxb-123456789012-abcdefGHIJKL");
  });

  it("returns clean text unchanged", () => {
    const clean = "Deployed v1.4.2 to staging; error rate back under 0.1%.";
    expect(redact(clean)).toBe(clean);
  });
});

describe("scan", () => {
  it("reports category, label, and matches without mutating text", () => {
    const findings = scan("ssn 123-45-6789 and email a@b.co");

    expect(findings).toEqual([
      { category: "financial", label: "ssn", matches: ["123-45-6789"] },
      { category: "contact", label: "email", matches: ["a@b.co"] },
    ]);
  });

  it("returns an empty list for clean text", () => {
    expect(scan("all quiet")).toEqual([]);
  });

  it("is stateless across repeated calls (no shared lastIndex)", () => {
    const text = "a@b.co";
    expect(scan(text)).toHaveLength(1);
    expect(scan(text)).toHaveLength(1);
  });
});

describe("assertNoPii", () => {
  it("passes on clean text", () => {
    expect(() => assertNoPii("nothing to see", "run-1")).not.toThrow();
  });

  it("throws PiiDetectedError naming the findings and context", () => {
    expect(() => assertNoPii("ssn 123-45-6789", "run-42")).toThrowError(PiiDetectedError);
    expect(() => assertNoPii("ssn 123-45-6789", "run-42")).toThrow(
      "[run-42] PII detected: financial/ssn",
    );
    expect(() => assertNoPii("ssn 123-45-6789")).toThrow("PII detected: financial/ssn");
  });

  it("exposes structured findings on the error", () => {
    try {
      assertNoPii("card 4111111111111111", "run-7");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PiiDetectedError);
      expect((err as PiiDetectedError).findings[0]).toMatchObject({
        category: "financial",
        label: "credit_card",
      });
    }
  });
});

describe("pattern catalog", () => {
  it("covers the union of the fleet's category sets", () => {
    const categories = new Set(REDACTION_PATTERNS.map((p) => p.category));
    expect([...categories].sort()).toEqual([
      "aws",
      "compensation",
      "contact",
      "customer",
      "dob",
      "financial",
      "health",
      "hr",
      "secrets",
    ]);
  });

  it("declares every pattern global so redact replaces all occurrences", () => {
    for (const { label, pattern } of REDACTION_PATTERNS) {
      expect(pattern.flags, `${label} must be global`).toContain("g");
    }
  });
});
