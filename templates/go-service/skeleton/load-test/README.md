# Load Testing

K6 load tests for the __PROJECT_NAME__ Go HTTP service.

## Prerequisites

Install [K6](https://grafana.com/docs/k6/latest/set-up/install-k6/):

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker pull grafana/k6
```

## Running

Start the service first, then run the load test:

```bash
# Start the service
make run

# Run with default config (localhost:8080)
k6 run load-test/k6/script.js

# Override base URL for staging/production
k6 run -e BASE_URL=http://staging:8080 load-test/k6/script.js

# Run with Docker
docker run --rm -i --network=host grafana/k6 run - <load-test/k6/script.js
```

## Configuration

Edit `k6/config.json` to adjust stages and thresholds:

| Field | Description |
|---|---|
| `stages` | Ramp-up/ramp-down pattern: duration + target VUs |
| `thresholds.http_req_duration` | Max acceptable latency percentile |
| `thresholds.http_req_failed` | Max acceptable error rate |

Default: ramp to 10 virtual users over 30 seconds, p95 latency under 500ms, error rate under 1%.

## Interpreting Results

K6 outputs a summary table after each run. Key metrics:

| Metric | What it means | Baseline target |
|---|---|---|
| `http_req_duration (p95)` | 95th percentile response time | < 500ms |
| `http_req_failed` | Percentage of failed requests | < 1% |
| `http_reqs` | Total requests completed | Depends on VU count |
| `iteration_duration` | Time for one full VU iteration | < 5s |
| `vus_max` | Peak concurrent virtual users | Matches stage target |

## Custom Metrics

The script tracks additional custom metrics:

- `errors` -- rate of failed checks across all endpoints
- `create_example_duration` -- trend for POST /api/v1/examples response time
- `get_example_duration` -- trend for GET /api/v1/examples/:id response time

## Extending

Add new groups in `script.js` for additional endpoints. Follow the existing pattern:

```js
group("POST /api/v1/your-endpoint", () => {
  const res = http.post(`${BASE_URL}/api/v1/your-endpoint`, payload, params);
  check(res, {
    "status 200": (r) => r.status === 200,
  }) || errorRate.add(1);
});
```
