# Definition of Done: __PROJECT_NAME__

**Format:** __FORMAT__

---

A user story or feature is considered **done** when all applicable items in this checklist are satisfied. Items marked with an asterisk (*) are mandatory for every story. Other items apply based on the nature of the change.

---

## Code Quality

- [ ] * Code reviewed and approved by at least one team member
- [ ] * All new code has type annotations (TypeScript strict mode, Python type hints, Go types)
- [ ] * No compiler warnings or linter errors introduced
- [ ] * No hardcoded secrets, credentials, or environment-specific values in code
- [ ] Error handling implemented at service boundaries with user-facing messages
- [ ] Complex logic has inline comments explaining the "why"
- [ ] Dead code removed, no commented-out blocks left behind

## Testing

- [ ] * Unit tests written for new business logic (aim for critical path coverage)
- [ ] * All existing tests pass (no regressions)
- [ ] Integration tests cover service interactions and data flow
- [ ] Acceptance criteria translated into automated tests where feasible
- [ ] Edge cases and boundary conditions tested
- [ ] Manual exploratory testing performed for UI changes
- [ ] Cross-browser testing completed for frontend changes

## Functionality

- [ ] * Acceptance criteria fully met (all Given/When/Then scenarios pass)
- [ ] * Feature works in the target environment (staging verified)
- [ ] Negative cases handled gracefully (invalid input, missing data, errors)
- [ ] Feature flags configured correctly (if applicable)
- [ ] Data migration scripts tested and reversible (if applicable)

## Performance

- [ ] No significant performance regression introduced
- [ ] Database queries optimized (no N+1, proper indexing)
- [ ] API response times within SLA thresholds
- [ ] Load tested if the change affects high-traffic paths

## Security

- [ ] Input validation implemented at API boundaries
- [ ] Authorization checks enforce proper access control
- [ ] Parameterized queries for all database operations (no string interpolation)
- [ ] Sensitive data encrypted at rest and in transit
- [ ] OWASP Top 10 risks reviewed for relevance

## Accessibility

- [ ] Interactive elements are keyboard navigable
- [ ] Form fields have associated labels
- [ ] Images have alt text, decorative images marked as presentation
- [ ] Color is not the sole means of conveying information
- [ ] WCAG 2.1 Level AA contrast ratios met

## Documentation

- [ ] * API documentation updated for new or changed endpoints
- [ ] README updated if setup steps, configuration, or architecture changed
- [ ] Runbook updated for new operational procedures
- [ ] Changelog entry drafted for user-facing changes

## Deployment

- [ ] * Feature deployable independently (no coupling to unreleased changes)
- [ ] * Environment variables and configuration documented
- [ ] Database migrations are backward compatible
- [ ] Feature flag allows gradual rollout if needed
- [ ] Rollback procedure identified and tested
- [ ] Monitoring and alerting configured for new components

## Sign-Off

- [ ] * Developer self-review completed
- [ ] * Code review approved
- [ ] * QA verification passed
- [ ] Product owner accepts the implementation
- [ ] Stakeholders notified of completion (if applicable)
