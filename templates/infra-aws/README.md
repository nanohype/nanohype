# infra-aws

AWS CDK (TypeScript) escape-hatch template. Use this **only** when the workload doesn't fit the default k8s-native path — Lambda / edge / serverless cases where running a pod is wrong (sub-second cold-start budget, event-driven only, true serverless cost profile).

The default AWS path is `k8s-app-tenant` (Helm chart + Platform CR on `eks-agent-platform` running on EKS provisioned by `landing-zone`). Reach for `infra-aws` only when you've already justified the escape in the architecture artifact — `qa-security` auto-REJECTs vague reasoning ("simpler") per `IAC_BY_TARGET`.

## When to actually use this

- **Lambda functions for event-driven work** — S3 triggers, EventBridge schedules, API Gateway endpoints with hard <1s p99, scheduled cron without a running pod
- **Edge / sub-second cold start** that EKS pods can't hit
- **Low-traffic services** where idle-pod cost is the wrong shape

## When NOT to use this

- **Anything long-running or stateful** → use `k8s-app-tenant`
- **AI workloads with kagent or KEDA scaling** → use `k8s-app-tenant` + `agent-fleet`
- **HTTP services that handle non-trivial concurrent load** → use `k8s-app-tenant`
- **Anything that needs IRSA + per-tenant ResourceQuota + ArgoCD-managed rollouts** → use `k8s-app-tenant`

The ECS Fargate path in this template is a historical fallback. Prefer EKS via `k8s-app-tenant` over ECS — same container, better tenant isolation, same observability stack as the rest of the nanohype-org infrastructure.

## What you get

- CDK app with modular, composable constructs
- Lambda path: Node.js 22 runtime, esbuild bundling, API Gateway
- ECS Fargate path (historical fallback — prefer EKS via `k8s-app-tenant`)
- Optional VPC with public/private subnets and NAT gateway
- Optional RDS PostgreSQL with Secrets Manager credentials
- Optional CloudWatch dashboards, alarms, and SNS notifications
- Snapshot tests with Jest
- Standard CDK toolchain scripts (synth, deploy, diff)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | `infra` | Kebab-case project name |
| `Description` | string | `AWS CDK infrastructure for AI services` | Project description |
| `AwsRegion` | string | `us-east-1` | AWS deployment region |
| `ComputeTarget` | enum | `lambda` | Compute platform: `lambda` (preferred) or `ecs` (fallback) |
| `IncludeVpc` | bool | `false` | Include VPC networking |
| `IncludeRds` | bool | `false` | Include RDS PostgreSQL |
| `IncludeMonitoring` | bool | `true` | Include CloudWatch monitoring |

## Project layout

```text
<ProjectName>/
  bin/
    app.ts                 # CDK app entrypoint
  lib/
    stack.ts               # Main stack composing constructs
    constructs/
      compute/
        lambda.ts          # Lambda function
        ecs.ts             # ECS Fargate service
      api/
        lambda.ts          # API Gateway
        ecs.ts             # ALB
      vpc.ts               # (optional) VPC
      database.ts          # (optional) RDS PostgreSQL
      monitoring.ts        # (optional) CloudWatch
  test/
    stack.test.ts          # Snapshot test
```

## Pairs with

- [go-service](../go-service/) — Go HTTP services (Lambda path)
- [ts-service](../ts-service/) — TypeScript API services (Lambda path)
- [go-cli](../go-cli/) — CLI tools deployed as Lambda functions

## Nests inside

- [monorepo](../monorepo/)

## Architecture-artifact requirement

When you choose this template, the architecture artifact MUST contain a section named "Why not k8s-native" that:

1. Names the specific constraint that disqualifies a pod-based workload (cold-start budget with measurement, traffic shape, idle cost analysis)
2. Lists the trade-offs being accepted by going Lambda/ECS instead of `k8s-app-tenant` + EKS (no Platform CR tenant boundary, no Kyverno policy enforcement, separate observability pipeline)
3. Includes the on-call playbook delta — Lambda failures don't get the same dashboards as Platform tenants

Without this section, `qa-security` REJECTs the build per `IAC_BY_TARGET`'s escape-hatch policy.
