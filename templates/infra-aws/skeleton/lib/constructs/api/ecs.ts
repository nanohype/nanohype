import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import type { ComputeConstruct } from "../compute/__COMPUTE_TARGET__";

export interface ApiConstructProps {
  readonly compute: ComputeConstruct;
  readonly vpc?: ec2.IVpc;
}

/**
 * ALB construct for __PROJECT_NAME__.
 *
 * Internet-facing Application Load Balancer with health-check target group.
 */
export class ApiConstruct extends Construct {
  public readonly endpointUrl: string;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const vpc =
      props.vpc ??
      ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    });

    const listener = this.loadBalancer.addListener("HttpListener", {
      port: 80,
    });

    listener.addTargets("EcsTarget", {
      port: 8080,
      targets: [props.compute.fargateService],
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    this.endpointUrl = `http://${this.loadBalancer.loadBalancerDnsName}`;
  }
}
