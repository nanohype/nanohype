import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export interface ApiConstructProps {
  readonly computeTarget: "lambda" | "ecs";
  readonly lambdaFunction?: lambda.IFunction;
  readonly fargateService?: ecs.FargateService;
  readonly vpc?: ec2.IVpc;
}

/**
 * API construct for __PROJECT_NAME__.
 *
 * Lambda: REST API via API Gateway with CORS and stage configuration.
 * ECS: Application Load Balancer with health-check target group.
 */
export class ApiConstruct extends Construct {
  public readonly endpointUrl: string;
  public readonly apiGateway?: apigateway.RestApi;
  public readonly loadBalancer?: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    if (props.computeTarget === "lambda" && props.lambdaFunction) {
      this.apiGateway = this.createApiGateway(props.lambdaFunction);
      this.endpointUrl = this.apiGateway.url;
    } else if (props.computeTarget === "ecs" && props.fargateService) {
      const alb = this.createLoadBalancer(props);
      this.loadBalancer = alb.loadBalancer;
      this.endpointUrl = `http://${this.loadBalancer.loadBalancerDnsName}`;
    } else {
      throw new Error("Invalid compute target or missing compute resource");
    }
  }

  private createApiGateway(fn: lambda.IFunction): apigateway.RestApi {
    const api = new apigateway.RestApi(this, "RestApi", {
      restApiName: "__PROJECT_NAME__-api",
      description: "__DESCRIPTION__",
      deployOptions: {
        stageName: "prod",
        tracingEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
        ],
      },
    });

    const integration = new apigateway.LambdaIntegration(fn, {
      proxy: true,
    });

    api.root.addMethod("ANY", integration);
    api.root.addResource("{proxy+}").addMethod("ANY", integration);

    return api;
  }

  private createLoadBalancer(props: ApiConstructProps): {
    loadBalancer: elbv2.ApplicationLoadBalancer;
  } {
    const vpc =
      props.vpc ??
      ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    });

    const listener = loadBalancer.addListener("HttpListener", {
      port: 80,
    });

    listener.addTargets("EcsTarget", {
      port: 8080,
      targets: [props.fargateService!],
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    return { loadBalancer };
  }
}
