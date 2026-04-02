import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ComputeConstruct } from "./constructs/compute/__COMPUTE_TARGET__";
import { ApiConstruct } from "./constructs/api/__COMPUTE_TARGET__";
import { VpcConstruct } from "./constructs/vpc";
import { DatabaseConstruct } from "./constructs/database";
import { MonitoringConstruct } from "./constructs/monitoring";

export interface ServiceStackProps extends cdk.StackProps {
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
      vpc: vpc?.vpc,
    });

    // API — API Gateway (Lambda) or ALB (ECS)
    const api = new ApiConstruct(this, "Api", {
      compute,
      vpc: vpc?.vpc,
    });

    // Database — RDS PostgreSQL when includeRds is true
    if (props.includeRds && vpc) {
      new DatabaseConstruct(this, "Database", {
        vpc: vpc.vpc,
        computeSecurityGroup: "securityGroup" in compute ? compute.securityGroup : undefined,
      });
    }

    // Monitoring — CloudWatch dashboard and alarms when includeMonitoring is true
    if (props.includeMonitoring) {
      new MonitoringConstruct(this, "Monitoring", {
        compute,
        api,
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
