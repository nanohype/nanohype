import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface ComputeConstructProps {
  readonly vpc?: ec2.IVpc;
}

/**
 * Lambda compute construct for __PROJECT_NAME__.
 *
 * Node.js 22 function bundled with esbuild, optional VPC placement.
 */
export class ComputeConstruct extends Construct {
  public readonly lambdaFunction: lambda.IFunction;
  public readonly serviceArn: string;

  constructor(scope: Construct, id: string, props: ComputeConstructProps) {
    super(scope, id);

    this.lambdaFunction = new lambdaNode.NodejsFunction(this, "Handler", {
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

    this.serviceArn = this.lambdaFunction.functionArn;
  }
}
