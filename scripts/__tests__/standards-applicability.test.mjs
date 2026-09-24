import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkStandards, readCorpus, rulesIn } from "../check-standards-applicability.mjs";

// The gate is run against the repository by `npm run validate:standards`. These
// cases hold its detection: each mutation below is one a grader would act on
// wrongly, and each must surface as a named failure rather than a clean run.

const ROOT = new URL("../..", import.meta.url).pathname;

/** A fresh, independently mutable copy of the repository's corpus. */
function corpus() {
  return structuredClone(readCorpus(ROOT));
}

function standard(c, name) {
  const found = c.standards.find((s) => s.name === name);
  assert.ok(found, `standards/${name}.json is in the corpus`);
  return found.data;
}

function failsWith(c, pattern) {
  const errors = checkStandards(c);
  assert.ok(
    errors.some((e) => pattern.test(e)),
    `expected an error matching ${pattern}, got:\n${errors.join("\n") || "(none)"}`,
  );
}

describe("checkStandards on the repository", () => {
  it("passes", () => {
    assert.deepEqual(checkStandards(readCorpus(ROOT)), []);
  });

  it("reads more than a handful of standards", () => {
    // A standards directory that failed to read would pass every per-file check.
    assert.ok(readCorpus(ROOT).standards.length > 5);
  });
});

describe("checkStandards refuses", () => {
  it("a standard with no applies_to", () => {
    const c = corpus();
    delete standard(c, "llm-policy").applies_to;
    failsWith(c, /llm-policy\.json declares no applies_to/);
  });

  it("a standard with no grades", () => {
    const c = corpus();
    delete standard(c, "seo-baseline").grades;
    failsWith(c, /seo-baseline\.json declares no grades/);
  });

  it("a grade naming a dimension the rubric does not publish", () => {
    const c = corpus();
    standard(c, "testing-rubric").grades = ["tests"];
    failsWith(c, /testing-rubric\.json grades "tests"/);
  });

  it("a standard other than the rubric that grades nothing", () => {
    const c = corpus();
    standard(c, "agent-access").grades = [];
    failsWith(c, /agent-access\.json grades no dimension/);
  });

  it("a rule grading a dimension its standard does not", () => {
    const c = corpus();
    standard(c, "version-currency").content.rules[0].grades = ["frontend"];
    failsWith(c, /version-currency\.json content\.rules\[0\] \(current-stable\) grades "frontend"/);
  });

  it("a schema dimension list that has drifted from the rubric", () => {
    const c = corpus();
    c.schema.$defs.dimension.enum = c.schema.$defs.dimension.enum.slice(1);
    failsWith(c, /\$defs\.dimension lists/);
  });

  it("a kind the schema names with no file behind it", () => {
    const c = corpus();
    c.schema.properties.kind.enum.push("nanohype/standards/unwritten");
    failsWith(c, /standards\/unwritten\.json does not exist/);
  });

  it("a file whose kind does not match its name", () => {
    const c = corpus();
    standard(c, "llm-policy").kind = "nanohype/standards/seo-baseline";
    failsWith(c, /llm-policy\.json declares kind nanohype\/standards\/seo-baseline/);
  });

  it("a standard the README does not name", () => {
    const c = corpus();
    c.readme = c.readme.replaceAll("`agent-access.json`", "agent access");
    failsWith(c, /README\.md does not name `agent-access\.json`/);
  });

  it("a standard the platform reference does not link", () => {
    const c = corpus();
    c.platformReference = c.platformReference.replaceAll("standards/agent-access.json", "#");
    failsWith(c, /platform-reference\.md does not link standards\/agent-access\.json/);
  });

  it("an agent token listed twice under different case", () => {
    const c = corpus();
    const fetchers = standard(c, "agent-access").content.agent_fetchers;
    fetchers.push({ ...fetchers[0], token: fetchers[0].token.toUpperCase() });
    failsWith(c, /lists token .* twice/);
  });

  it("a probed class with no token to send", () => {
    const c = corpus();
    const content = standard(c, "agent-access").content;
    content.agent_fetchers = content.agent_fetchers.filter((f) => f.class !== "user-initiated");
    failsWith(c, /probes class user-initiated, and no fetcher/);
  });
});

describe("rulesIn", () => {
  it("finds rules nested below the top of content", () => {
    // telemetry-pipeline keeps its rules under signal_contract, and a walk that
    // stopped at the top level would leave them unchecked.
    const found = rulesIn({
      signal_contract: { rules: [{ id: "a" }] },
      requirements: [{ id: "b" }],
    });
    assert.deepEqual(
      found.map((f) => f.path),
      ["content.signal_contract.rules[0]", "content.requirements[0]"],
    );
  });
});
