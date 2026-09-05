---
title: Deploy Rollback
type: runbook
sources:
  - release-engineering
createdAt: 2024-01-08T00:00:00.000Z
updatedAt: 2024-01-08T00:00:00.000Z
confidence: sourced
path: deploy-rollback.md
---

## Summary

Every production deploy stays reversible for a fixed window. Past that window
the release is considered adopted and a rollback becomes a forward fix.

## Details

The rollback window is 30 minutes, measured from the moment the deploy finishes
rather than from when it started.

Roll back with:

```
wiki-ops deploy rollback --to <release-id>
```

The release id is printed at the end of every deploy and is also listed by
`wiki-ops deploy history`.

## References

Release engineering handbook, deploy chapter.
