import type { CatalogSource } from './source.js';
import type {
  LanguageToolchainStandard,
  LLMPolicyStandard,
  PlatformTenantContractStandard,
  QualityRubricDimensionsStandard,
  Standard,
  StandardName,
  Standards,
  VersionCurrencyStandard,
} from './types.js';
import { NanohypeError } from './errors.js';

const ALL_STANDARDS: StandardName[] = [
  'language-toolchain',
  'version-currency',
  'platform-tenant-contract',
  'llm-policy',
  'quality-rubric-dimensions',
];

const EXPECTED_KIND: Record<StandardName, Standard['kind']> = {
  'language-toolchain': 'nanohype/standards/language-toolchain',
  'version-currency': 'nanohype/standards/version-currency',
  'platform-tenant-contract': 'nanohype/standards/platform-tenant-contract',
  'llm-policy': 'nanohype/standards/llm-policy',
  'quality-rubric-dimensions': 'nanohype/standards/quality-rubric-dimensions',
};

/**
 * Load a single standards file from a source.
 *
 * Validates the `kind` discriminator against the expected value for `name`
 * so a misnamed or corrupted file fails fast rather than producing
 * confusing downstream errors.
 */
export async function loadStandard(
  source: CatalogSource,
  name: StandardName,
): Promise<Standard> {
  const standard = await source.fetchStandard(name);
  const expected = EXPECTED_KIND[name];
  if (standard.kind !== expected) {
    throw new NanohypeError(
      `Standard '${name}' has unexpected kind: ${standard.kind} (expected ${expected})`,
    );
  }
  return standard;
}

/**
 * Load every published standard in a single bundle.
 *
 * Fires the five fetches in parallel. The return shape exposes each
 * standard under its canonical name so consumers don't have to remember
 * the `kind` discriminator strings (`bundle['language-toolchain']` rather
 * than scanning the union).
 */
export async function loadStandards(source: CatalogSource): Promise<Standards> {
  const [toolchain, currency, contract, llm, rubric] = await Promise.all(
    ALL_STANDARDS.map((name) => loadStandard(source, name)),
  );
  return {
    'language-toolchain': toolchain as LanguageToolchainStandard,
    'version-currency': currency as VersionCurrencyStandard,
    'platform-tenant-contract': contract as PlatformTenantContractStandard,
    'llm-policy': llm as LLMPolicyStandard,
    'quality-rubric-dimensions': rubric as QualityRubricDimensionsStandard,
  };
}
