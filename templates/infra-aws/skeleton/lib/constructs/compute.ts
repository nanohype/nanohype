import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface ComputeConstructProps {
  readonly computeTarget: "lambda" | "ecs";
  readonly vpc?: ec2.IVpc;
}

/**
 * Compute construct for __PROJECT_NAME__.
 *
 * Compute target: __COMPUTE_TARGET__
 *
 * Lambda path: Node.js 22 function bundled with esbuild.
 * ECS path: Fargate service with auto-scaling.
 */
export class ComputeConstruct extends Construct {
  public readonly lambdaFunction?: lambda.IFunction;
  public readonly fargateService?: ecs.FargateService;
  public readonly securityGroup?: ec2.ISecurityGroup;
  public readonly serviceArn: string;

  constructor(scope: Construct, id: string, props: ComputeConstructProps) {
    super(scope, id);

    if (props.computeTarget === "lambda") {
      this.lambdaFunction = this.createLambdaFunction(props);
      this.serviceArn = this.lambdaFunction.functionArn;
    } else {
      const result = this.createFargateService(props);
      this.fargateService = result.service;
      this.securityGroup = result.securityGroup;
      this.serviceArn = this.fargateService.serviceArn;
    }
  }

  private createLambdaFunction(
    props: ComputeConstructProps
  ): lambda.IFunction {
    const fn = new lambdaNode.NodejsFunction(this, "Handler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: "lambda/handler.ts",
      handler: "handler",
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: "production",
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
      },
      vpc: props.vpc,
    });

    return fn;
  }

  private createFargateService(props: ComputeConstructProps): {
    service: ecs.FargateService;
    securityGroup: ec2.SecurityGroup;
  } {
    const vpc =
      props.vpc ??
      ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    taskDefinition.addContainer("App", {
      image: ecs.ContainerImage.fromAsset("."),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "__PROJECT_NAME__",
      }),
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
    });

    const securityGroup = new ec2.SecurityGroup(this, "ServiceSg", {
      vpc,
      description: "__PROJECT_NAME__ service security group",
      allowAllOutbound: true,
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [securityGroup],
      assignPublicIp: false,
    });

    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    return { service, securityGroup };
  }
}
