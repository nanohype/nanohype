# infra-aws

AWS CDK (TypeScript) infrastructure for deploying AI services. Supports Lambda or ECS Fargate compute with API Gateway or ALB, optional VPC, RDS PostgreSQL, and CloudWatch monitoring.

## What you get

- CDK app with modular, composable constructs
- Lambda path: Node.js 22 runtime, esbuild bundling, API Gateway
- ECS path: Fargate service with ALB, auto-scaling
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
| `ComputeTarget` | enum | `lambda` | Compute platform: lambda or ecs |
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

- [go-service](../go-service/) -- deploy Go HTTP services
- [ts-service](../ts-service/) -- deploy TypeScript API services
- [go-cli](../go-cli/) -- deploy CLI tools as Lambda functions

## Nests inside

- [monorepo](../monorepo/)
