import { ComputeConstruct as EcsCompute } from "./ecs";
import { ComputeConstruct as LambdaCompute } from "./lambda";

// Both compute targets ship in the skeleton; the scaffolder selects one via
// __COMPUTE_TARGET__ (resolves to "ecs" or "lambda"). The record is typed with a
// string key so the unresolved placeholder still type-checks before rendering.
const computeTargets: Record<string, typeof EcsCompute | typeof LambdaCompute> = {
  ecs: EcsCompute,
  lambda: LambdaCompute,
};

export const ComputeConstruct = computeTargets["__COMPUTE_TARGET__"];
export type ComputeConstruct = InstanceType<typeof ComputeConstruct>;
