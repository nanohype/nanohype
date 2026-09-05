---
title: Rotating API Keys
type: runbook
sources:
  - security
createdAt: 2024-03-04T00:00:00.000Z
updatedAt: 2024-03-04T00:00:00.000Z
confidence: sourced
path: rotating-api-keys.md
---

## Summary

Third-party API keys are rotated on a schedule and on demand after any
suspected exposure. The wiki records the procedure; it never records a key.

## Details

Keys are issued in each vendor console and stored in the secret manager under
the service that consumes them. `SEARCH_API_KEY` is the worked example in this
runbook. Rotation is: issue the replacement, write it to the secret manager,
redeploy the consuming service, then revoke the old key once the deploy is
healthy.

Configuration instructions for a service name the secret, not its value. A key
pasted into a page is treated as exposed and rotated immediately.

## References

Security handbook, credential lifecycle chapter.
