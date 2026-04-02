import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ComputeConstruct } from "./constructs/compute";
import { ApiConstruct } from "./constructs/api";
import { VpcConstruct } from "./constructs/vpc";
import { DatabaseConstruct } from "./constructs/database";
import { MonitoringConstruct } from "./constructs/monitoring";

export interface ServiceStackProps extends cdk.StackProps {
  readonly computeTarget: "lambda" | "ecs";
  readonly includeVpc: boolean;
  readonly includeRds: boolean;
  readonly includeMonitoring: boolean;
}

export class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    // VPC — created when includeVpc is true, or when RDS requires it
    let vpc: VpcConstruct | undefined;
    if (props.includeVpc || props.includeRds) {
      vpc = new VpcConstruct(this, "Vpc");
    }

    // Compute — Lambda function or ECS Fargate service
    const compute = new ComputeConstruct(this, "Compute", {
      computeTarget: props.computeTarget,
      vpc: vpc?.vpc,
    });

    // API — API Gateway (Lambda) or ALB (ECS)
    const api = new ApiConstruct(this, "Api", {
      computeTarget: props.computeTarget,
      lambdaFunction: compute.lambdaFunction,
      fargateService: compute.fargateService,
      vpc: vpc?.vpc,
    });

    // Database — RDS PostgreSQL when includeRds is true
    if (props.includeRds && vpc) {
      new DatabaseConstruct(this, "Database", {
        vpc: vpc.vpc,
        computeSecurityGroup: compute.securityGroup,
      });
    }

    // Monitoring — CloudWatch dashboard and alarms when includeMonitoring is true
    if (props.includeMonitoring) {
      new MonitoringConstruct(this, "Monitoring", {
        computeTarget: props.computeTarget,
        lambdaFunction: compute.lambdaFunction,
        fargateService: compute.fargateService,
        api: api,
      });
    }

    // Stack outputs
    new cdk.CfnOutput(this, "ApiEndpointUrl", {
      value: api.endpointUrl,
      description: "API endpoint URL",
    });

    new cdk.CfnOutput(this, "ServiceArn", {
      value: compute.serviceArn,
      description: "Compute service ARN (Lambda function or ECS service)",
    });
  }
}
