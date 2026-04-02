import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import type { ComputeConstruct } from "../compute/__COMPUTE_TARGET__";

export interface ApiConstructProps {
  readonly compute: ComputeConstruct;
  readonly vpc?: ec2.IVpc;
}

/**
 * API Gateway construct for __PROJECT_NAME__.
 *
 * REST API with CORS, proxy integration, and tracing enabled.
 */
export class ApiConstruct extends Construct {
  public readonly endpointUrl: string;
  public readonly apiGateway: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    this.apiGateway = new apigateway.RestApi(this, "RestApi", {
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

    const integration = new apigateway.LambdaIntegration(
      props.compute.lambdaFunction,
      { proxy: true }
    );

    this.apiGateway.root.addMethod("ANY", integration);
    this.apiGateway.root.addResource("{proxy+}").addMethod("ANY", integration);

    this.endpointUrl = this.apiGateway.url;
  }
}
