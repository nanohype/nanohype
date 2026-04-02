import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { ServiceStack } from "../lib/stack";

describe("ServiceStack", () => {
  test("snapshot matches with default props", () => {
    const app = new cdk.App();

    const stack = new ServiceStack(app, "TestStack", {
      env: { region: "__AWS_REGION__", account: "123456789012" },
      computeTarget: "__COMPUTE_TARGET__" as "lambda" | "ecs",
      includeVpc: false,
      includeRds: false,
      includeMonitoring: true,
    });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });

  test("creates Lambda function when compute target is lambda", () => {
    const app = new cdk.App();

    const stack = new ServiceStack(app, "LambdaStack", {
      env: { region: "us-east-1", account: "123456789012" },
      computeTarget: "lambda",
      includeVpc: false,
      includeRds: false,
      includeMonitoring: false,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
    });
  });

  test("creates ECS service when compute target is ecs", () => {
    const app = new cdk.App();

    const stack = new ServiceStack(app, "EcsStack", {
      env: { region: "us-east-1", account: "123456789012" },
      computeTarget: "ecs",
      includeVpc: false,
      includeRds: false,
      includeMonitoring: false,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::ECS::Service", {
      LaunchType: "FARGATE",
    });
  });
});
