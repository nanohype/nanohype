import { Construct } from "constructs";
import { ApiConstruct as EcsApi } from "./ecs";
import { ApiConstruct as LambdaApi } from "./lambda";
import type { ComputeConstruct } from "../compute";

// Both API targets ship in the skeleton; the scaffolder selects one via
// __COMPUTE_TARGET__ (resolves to "ecs" or "lambda"). The record is typed with a
// string key so the unresolved placeholder still type-checks before rendering.
const apiTargets: Record<string, typeof EcsApi | typeof LambdaApi> = {
  ecs: EcsApi,
  lambda: LambdaApi,
};

export type ApiConstruct = InstanceType<typeof EcsApi | typeof LambdaApi>;

export interface ApiConstructProps {
  readonly compute: ComputeConstruct;
  readonly vpc?: import("aws-cdk-lib/aws-ec2").IVpc;
}

// The compute and API targets always resolve to the same platform, so the
// selected API construct accepts whichever ComputeConstruct the barrel exports.
export const ApiConstruct = apiTargets["__COMPUTE_TARGET__"] as new (
  scope: Construct,
  id: string,
  props: ApiConstructProps
) => ApiConstruct;
