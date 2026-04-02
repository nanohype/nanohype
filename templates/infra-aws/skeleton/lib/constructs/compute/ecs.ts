import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

export interface ComputeConstructProps {
  readonly vpc?: ec2.IVpc;
}

/**
 * ECS Fargate compute construct for __PROJECT_NAME__.
 *
 * Fargate service with auto-scaling (1-10 tasks, 70% CPU target).
 */
export class ComputeConstruct extends Construct {
  public readonly fargateService: ecs.FargateService;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly serviceArn: string;

  constructor(scope: Construct, id: string, props: ComputeConstructProps) {
    super(scope, id);

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

    this.securityGroup = new ec2.SecurityGroup(this, "ServiceSg", {
      vpc,
      description: "__PROJECT_NAME__ service security group",
      allowAllOutbound: true,
    });

    this.fargateService = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [this.securityGroup],
      assignPublicIp: false,
    });

    const scaling = this.fargateService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    this.serviceArn = this.fargateService.serviceArn;
  }
}
