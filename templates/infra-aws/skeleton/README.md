# __PROJECT_NAME__

__DESCRIPTION__

## Architecture

This project deploys an AI service infrastructure on AWS using CDK with the following components:

- **Compute:** __COMPUTE_TARGET__ — Lambda function with API Gateway or ECS Fargate service with Application Load Balancer
- **Region:** __AWS_REGION__
- **VPC:** Networking with public/private subnets, NAT gateway, and VPC endpoints (when enabled)
- **Database:** RDS PostgreSQL with Secrets Manager credential management (when enabled)
- **Monitoring:** CloudWatch dashboard, metric alarms, and SNS notifications (when enabled)

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate credentials
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) (`npm install -g aws-cdk`)

## Getting Started

### Bootstrap CDK (first time only)

```bash
cdk bootstrap aws://ACCOUNT_ID/__AWS_REGION__
```

### Deploy

```bash
npm run build
npm run deploy
```

### Other Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run snapshot and assertion tests |
| `npm run synth` | Synthesize CloudFormation template |
| `npm run diff` | Compare deployed stack with local changes |
| `npm run deploy` | Deploy stack to AWS |

## Project Structure

```
bin/
  app.ts                  # CDK app entrypoint
lib/
  stack.ts                # Main stack — composes all constructs
  constructs/
    compute/
      lambda.ts           # Lambda function compute
      ecs.ts              # ECS Fargate compute
    api/
      lambda.ts           # API Gateway
      ecs.ts              # Application Load Balancer
    vpc.ts                # VPC with subnets and endpoints
    database.ts           # RDS PostgreSQL
    monitoring.ts         # CloudWatch dashboard and alarms
test/
  stack.test.ts           # Snapshot and resource assertion tests
```

## Customization

### Compute Target

This project was generated with the `__COMPUTE_TARGET__` compute target. The active target's constructs are imported via `lib/constructs/compute/__COMPUTE_TARGET__` and `lib/constructs/api/__COMPUTE_TARGET__`. To use the alternate target, update the import paths in `lib/stack.ts` and `lib/constructs/monitoring.ts`.

- For ECS, add a `Dockerfile` at the project root
- For Lambda, implement your handler in `lambda/handler.ts`

### Adding Resources

Create new constructs in `lib/constructs/` and wire them into `lib/stack.ts`. Follow the existing pattern of typed props and conditional instantiation.

### Environment-Specific Configuration

Use CDK context values or environment variables to customize per-environment settings. See the [CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/context.html) for details.
