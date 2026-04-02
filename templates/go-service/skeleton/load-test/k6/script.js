import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── K6 Load Test ────────────────────────────────────────────────────
//
// Tests the core API endpoints under load. Run with:
//   k6 run load-test/k6/script.js
//
// Override base URL:
//   k6 run -e BASE_URL=http://staging:8080 load-test/k6/script.js
//

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const errorRate = new Rate("errors");
const createDuration = new Trend("create_example_duration");
const getDuration = new Trend("get_example_duration");

// Load config from config.json — K6 options
const config = JSON.parse(open("./config.json"));

export const options = {
  stages: config.stages,
  thresholds: config.thresholds,
};

export default function () {
  // ── Health Check ────────────────────────────────────────────────
  group("GET /health", () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      "health status 200": (r) => r.status === 200,
      "health body has status ok": (r) => r.json("status") === "ok",
    }) || errorRate.add(1);
  });

  sleep(0.5);

  // ── Create Example ─────────────────────────────────────────────
  let exampleId;

  group("POST /api/v1/examples", () => {
    const payload = JSON.stringify({
      name: `load-test-${Date.now()}`,
      value: "Created during load test",
    });

    const params = {
      headers: { "Content-Type": "application/json" },
    };

    const res = http.post(`${BASE_URL}/api/v1/examples`, payload, params);
    createDuration.add(res.timings.duration);

    const ok = check(res, {
      "create status 201": (r) => r.status === 201,
      "create returns id": (r) => !!r.json("id"),
    });

    if (!ok) errorRate.add(1);

    if (res.status === 201) {
      exampleId = res.json("id");
    }
  });

  sleep(0.5);

  // ── Get Example by ID ──────────────────────────────────────────
  if (exampleId) {
    group("GET /api/v1/examples/:id", () => {
      const res = http.get(`${BASE_URL}/api/v1/examples/${exampleId}`);
      getDuration.add(res.timings.duration);

      check(res, {
        "get status 200": (r) => r.status === 200,
        "get returns correct id": (r) => r.json("id") === exampleId,
      }) || errorRate.add(1);
    });
  }

  sleep(0.5);

  // ── List Examples ──────────────────────────────────────────────
  group("GET /api/v1/examples", () => {
    const res = http.get(`${BASE_URL}/api/v1/examples`);

    check(res, {
      "list status 200": (r) => r.status === 200,
      "list returns array": (r) => Array.isArray(r.json()),
    }) || errorRate.add(1);
  });

  sleep(0.5);
}
