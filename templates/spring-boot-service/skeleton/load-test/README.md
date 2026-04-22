# Load tests

[k6](https://k6.io/) scripts for synthetic load.

## Run

```sh
k6 run k6/script.js

# against a non-local environment
BASE_URL=https://staging.example.com k6 run k6/script.js
```

## Thresholds

See `k6/config.json` — p95 latency must stay under 500ms, error rate under 1%.
