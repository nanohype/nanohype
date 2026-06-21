import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { ComputeConstruct } from "./constructs/compute";
import { ApiConstruct } from "./constructs/api";
// #if IncludeVpc || IncludeRds
import { VpcConstruct } from "./constructs/vpc";
// #endif
// #if IncludeRds
import { DatabaseConstruct } from "./constructs/database";
// #endif
// #if IncludeMonitoring
import { MonitoringConstruct } from "./constructs/monitoring";
// #endif

export interface ServiceStackProps extends cdk.StackProps {
  readonly includeVpc: boolean;
  readonly includeRds: boolean;
  readonly includeMonitoring: boolean;
}

export class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    // VPC — created when includeVpc is true, or when RDS requires it. Held as the
    // underlying IVpc so the compute/api wiring below stays valid even when the
    // VpcConstruct import is conditionally rendered out.
    let vpc: ec2.IVpc | undefined;
    // #if IncludeVpc || IncludeRds
    if (props.includeVpc || props.includeRds) {
      vpc = new VpcConstruct(this, "Vpc").vpc;
    }
    // #endif

    // Compute — Lambda function or ECS Fargate service
    const compute = new ComputeConstruct(this, "Compute", {
      vpc,
    });

    // API — API Gateway (Lambda) or ALB (ECS)
    const api = new ApiConstruct(this, "Api", {
      compute,
      vpc,
    });

    // Database — RDS PostgreSQL when includeRds is true
    // #if IncludeRds
    if (props.includeRds && vpc) {
      new DatabaseConstruct(this, "Database", {
        vpc,
        computeSecurityGroup: "securityGroup" in compute ? compute.securityGroup : undefined,
      });
    }
    // #endif

    // Monitoring — CloudWatch dashboard and alarms when includeMonitoring is true
    // #if IncludeMonitoring
    if (props.includeMonitoring) {
      new MonitoringConstruct(this, "Monitoring", {
        compute,
        api,
      });
    }
    // #endif

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
