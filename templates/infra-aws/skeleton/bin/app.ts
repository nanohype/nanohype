#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ServiceStack } from "../lib/stack";

const app = new cdk.App();

// Feature flags — the scaffolder substitutes each placeholder with "true" or
// "false"; the string annotations keep the comparison valid before rendering.
const includeVpc: string = "__INCLUDE_VPC__";
const includeRds: string = "__INCLUDE_RDS__";
const includeMonitoring: string = "__INCLUDE_MONITORING__";

new ServiceStack(app, "__PROJECT_NAME__-stack", {
  env: {
    region: "__AWS_REGION__",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  includeVpc: includeVpc === "true",
  includeRds: includeRds === "true",
  includeMonitoring: includeMonitoring === "true",
});
