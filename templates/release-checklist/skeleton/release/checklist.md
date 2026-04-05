# Release Checklist: __PROJECT_NAME__

**Release Type:** __RELEASE_TYPE__
**Version:** [X.Y.Z]
**Target Date:** YYYY-MM-DD
**Release Manager:** [Name]

---

## Pre-Release Validation

### Code Readiness

- [ ] All planned features merged to release branch
- [ ] No open pull requests targeting this release
- [ ] Code freeze enforced — only bug fixes allowed past this point
- [ ] Version number updated in all relevant files (package.json, version constants, etc.)
- [ ] Changelog/release notes drafted and reviewed
- [ ] License headers present on all source files

### Quality Gates

- [ ] All CI pipelines passing on release branch
- [ ] Unit test suite passing (100% of critical path tests)
- [ ] Integration test suite passing
- [ ] End-to-end test suite passing in staging environment
- [ ] No open Severity-1 or Severity-2 defects
- [ ] Performance benchmarks within acceptable thresholds
- [ ] Security scan completed with no critical or high findings

### Environment Readiness

- [ ] Staging environment matches production configuration
- [ ] Database migrations tested in staging (forward and rollback)
- [ ] Environment variables and secrets configured for production
- [ ] Feature flags set to correct states for this release
- [ ] Third-party service API keys and quotas verified
- [ ] SSL certificates valid and not expiring within 30 days

### Documentation

- [ ] API documentation updated for new or changed endpoints
- [ ] User-facing documentation updated (help docs, guides)
- [ ] Runbook updated for new operational procedures
- [ ] Known issues documented with workarounds where applicable
- [ ] Migration guide prepared (for __RELEASE_TYPE__ releases with breaking changes)

---

## Deployment Steps

### Pre-Deployment

1. [ ] Notify stakeholders of deployment window
2. [ ] Verify deployment tooling is operational
3. [ ] Confirm rollback procedure is documented and tested
4. [ ] Take pre-deployment database backup
5. [ ] Verify monitoring dashboards are accessible

### Deployment Execution

1. [ ] Deploy database migrations (if applicable)
2. [ ] Deploy application to production
3. [ ] Verify deployment completed without errors
4. [ ] Confirm correct version is running (`/health` or version endpoint)
5. [ ] Verify feature flags are in expected states

### Post-Deployment

1. [ ] Run smoke test suite against production
2. [ ] Verify critical user workflows (login, core features)
3. [ ] Check error rate dashboards for anomalies
4. [ ] Monitor application logs for unexpected errors
5. [ ] Verify external integrations are functioning
6. [ ] Confirm CDN cache invalidation (if applicable)

---

## Communication

### Pre-Release

- [ ] Engineering team notified of release scope and timeline
- [ ] Support team briefed on new features and known issues
- [ ] Status page updated with maintenance window (if applicable)

### Post-Release

- [ ] Release announcement sent to stakeholders
- [ ] Status page updated to confirm deployment complete
- [ ] Support team notified that release is live
- [ ] Release notes published (GitHub release, changelog, blog post)

---

## Release-Type Specific Items

### Major Release

- [ ] Breaking change migration guide published
- [ ] Deprecation notices issued for removed features
- [ ] Extended monitoring period (48 hours minimum)
- [ ] Customer communication sent for breaking changes
- [ ] Support escalation path confirmed for migration issues

### Minor Release

- [ ] New features verified against acceptance criteria
- [ ] Standard monitoring period (24 hours)
- [ ] Feature documentation published

### Patch Release

- [ ] Bug fix verified in staging with original reproduction steps
- [ ] Regression test focused on affected areas
- [ ] Abbreviated monitoring period (4 hours minimum)

---

## Final Sign-Off

| Role | Name | Approved | Date |
|---|---|---|---|
| Engineering Lead | | [ ] | |
| QA Lead | | [ ] | |
| Product Owner | | [ ] | |
| Release Manager | | [ ] | |
