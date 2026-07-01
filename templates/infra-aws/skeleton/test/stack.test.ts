import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { ServiceStack } from "../lib/stack";

describe("ServiceStack", () => {
  test("snapshot matches with default props", () => {
    const app = new cdk.App();

    const stack = new ServiceStack(app, "TestStack", {
      env: { region: "__AWS_REGION__", account: "123456789012" },
      includeVpc: false,
      includeRds: false,
      includeMonitoring: true,
    });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });

  test("creates compute resources for __COMPUTE_TARGET__ target", () => {
    const app = new cdk.App();

    const stack = new ServiceStack(app, "ComputeStack", {
      env: { region: "us-east-1", account: "123456789012" },
      includeVpc: false,
      includeRds: false,
      includeMonitoring: false,
    });

    const template = Template.fromStack(stack);

    // The concrete resource type depends on the __COMPUTE_TARGET__ selected
    // at generation time, so assert on the synthesized set: with VPC, RDS,
    // and monitoring disabled, every resource in the stack belongs to the
    // compute target — an empty set means it synthesized nothing.
    const resources: Record<string, unknown> = template.toJSON().Resources ?? {};
    expect(Object.keys(resources).length).toBeGreaterThan(0);
  });

  test("includes monitoring when enabled", () => {
    const app = new cdk.App();

    const stack = new ServiceStack(app, "MonitoringStack", {
      env: { region: "us-east-1", account: "123456789012" },
      includeVpc: false,
      includeRds: false,
      includeMonitoring: true,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {});
    template.hasResourceProperties("AWS::SNS::Topic", {});
  });
});
