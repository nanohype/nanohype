# __SERVICE_NAME__ — Operational Procedures

**Project:** __PROJECT_NAME__
**On-call tool:** __ON_CALL_TOOL__
**Last updated:** YYYY-MM-DD

---

## Standard Deployments

### Deploy to Production

**When:** After code review, CI passes, and staging validation

1. Merge PR to `main` branch
2. CI pipeline builds container image and pushes to registry
3. Verify new image tag in deploy pipeline: `deploy/__PROJECT_NAME__/production`
4. Monitor deploy progress in CI dashboard
5. Watch dashboards for 15 minutes post-deploy:
   - Error rate: should not exceed baseline by > 0.5%
   - Latency p99: should not exceed baseline by > 50ms
   - Health check: all instances returning 200
6. If metrics look healthy, deploy is complete

**Verification commands:**

```bash
# Check running version
curl -s https://prod.__PROJECT_NAME__.example.com/health | jq '.version'

# Check instance count and health
kubectl get pods -l app=__PROJECT_NAME__ -n production

# Tail recent logs
kubectl logs -l app=__PROJECT_NAME__ -n production --tail=50
```

---

### Rollback

**When:** Post-deploy metrics degrade beyond acceptable thresholds

**Decision criteria:** Roll back if any of the following persist for > 5 minutes after deploy:
- Error rate > 2x baseline
- P99 latency > 2x baseline
- Health check failures on > 10% of instances

**Procedure:**

1. Announce rollback in `#ops-incidents` Slack channel
2. Revert to previous image tag:
   ```bash
   # Identify previous stable image tag
   kubectl rollout history deployment/__PROJECT_NAME__ -n production

   # Rollback to previous revision
   kubectl rollout undo deployment/__PROJECT_NAME__ -n production
   ```
3. Wait for rollout to complete (watch with `kubectl rollout status`)
4. Verify health checks pass on all instances
5. Monitor dashboards for 15 minutes to confirm stability
6. File a post-deploy issue describing what went wrong

---

## Scaling

### Horizontal Scaling

**When:** CPU utilization > 70% sustained for 10+ minutes, or request queue depth growing

```bash
# Check current replica count
kubectl get hpa __PROJECT_NAME__ -n production

# Manual scale (if autoscaler is insufficient)
kubectl scale deployment/__PROJECT_NAME__ -n production --replicas=N
```

**Considerations:**
- Maximum replicas: 20 (constrained by database connection pool)
- Each replica uses ~256MB memory, 0.25 vCPU at idle
- New replicas take ~30 seconds to pass health checks
- Verify database connection pool is not exhausted after scaling

### Database Connection Saturation

**When:** Active connections approaching pool maximum (25 per instance)

1. Check current connections: `SELECT count(*) FROM pg_stat_activity WHERE datname = '__PROJECT_NAME__';`
2. If connections are leaking, identify long-running queries: `SELECT pid, query, state, age(now(), query_start) FROM pg_stat_activity WHERE datname = '__PROJECT_NAME__' ORDER BY query_start;`
3. Kill idle-in-transaction connections older than 5 minutes: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '__PROJECT_NAME__' AND state = 'idle in transaction' AND query_start < now() - interval '5 minutes';`
4. If the issue persists, reduce replica count or increase connection pool max

---

## Troubleshooting

### High Error Rate

**Symptoms:** Error rate alert fires (> 1% for 5 minutes)

**Diagnosis:**

1. Check error breakdown by status code:
   ```bash
   # Query metrics for error distribution
   curl -s 'http://prometheus:9090/api/v1/query?query=rate(http_requests_total{app="__PROJECT_NAME__",status=~"5.."}[5m])' | jq
   ```
2. Check application logs for error patterns:
   ```bash
   kubectl logs -l app=__PROJECT_NAME__ -n production --tail=200 | grep -i error
   ```
3. Check dependency health — is a downstream service failing?
   - PostgreSQL: `pg_isready -h db.__PROJECT_NAME__.internal`
   - Redis: `redis-cli -h redis.__PROJECT_NAME__.internal ping`
4. Check for recent deployments that may have introduced the error

**Resolution paths:**
- If caused by deploy → rollback (see above)
- If caused by dependency failure → check dependency status, engage dependency owner
- If caused by traffic spike → scale up (see above)
- If caused by data issue → investigate specific failing requests in logs

---

### High Latency

**Symptoms:** Latency alert fires (p99 > 500ms for 10 minutes)

**Diagnosis:**

1. Check latency distribution by endpoint:
   ```bash
   curl -s 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{app="__PROJECT_NAME__"}[5m]))' | jq
   ```
2. Check database query performance:
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   WHERE dbid = (SELECT oid FROM pg_database WHERE datname = '__PROJECT_NAME__')
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```
3. Check Redis cache hit rate — a drop in hit rate means more database calls
4. Check CPU and memory utilization on application instances

**Resolution paths:**
- If caused by slow queries → identify and optimize the query, add index if needed
- If caused by cache miss spike → investigate cache eviction or Redis issues
- If caused by resource saturation → scale up instances
- If caused by upstream dependency → check gateway and upstream service latency

---

### Health Check Failures

**Symptoms:** Readiness probe failing, instances being removed from load balancer

**Diagnosis:**

1. Check which instances are failing:
   ```bash
   kubectl get pods -l app=__PROJECT_NAME__ -n production -o wide
   ```
2. Check the readiness endpoint directly on failing pods:
   ```bash
   kubectl exec -it <pod-name> -n production -- curl -s localhost:8080/ready
   ```
3. Check dependency connectivity from failing pods:
   ```bash
   kubectl exec -it <pod-name> -n production -- pg_isready -h db.__PROJECT_NAME__.internal
   ```
4. Check pod events for OOM kills or crash loops:
   ```bash
   kubectl describe pod <pod-name> -n production
   ```

**Resolution paths:**
- If caused by dependency unreachable → check network policies and dependency health
- If caused by OOM → increase memory limits or investigate memory leak
- If caused by crash loop → check logs for startup errors, rollback if recent deploy
