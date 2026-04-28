import { existsSync, readFileSync } from 'node:fs';
import { safeDefaultConfig } from './defaults.js';
import { SawyerConfigSchema, type SawyerConfig } from '../types/config.js';

export interface ConfigLoadResult {
  config: SawyerConfig;
  warnings: string[];
  errors: string[];
  usingDefaults: boolean;
}

export function loadSawyerConfig(path = 'sawyer.config.json'): ConfigLoadResult {
  if (!existsSync(path)) {
    return {
      config: safeDefaultConfig(),
      warnings: ['config file missing; using local-safe defaults'],
      errors: [],
      usingDefaults: true
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      config: safeDefaultConfig(),
      warnings: [],
      errors: [`malformed config JSON: ${(error as Error).message}`],
      usingDefaults: false
    };
  }

  const validated = SawyerConfigSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      config: safeDefaultConfig(),
      warnings: [],
      errors: validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      usingDefaults: false
    };
  }

  const config = validated.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.toggles.enable_private_mode && config.toggles.enable_cloud_fallback) {
    errors.push('unsafe conflict: private mode cannot be combined with cloud fallback');
  }

  for (const [providerKey, provider] of Object.entries(config.providers)) {
    if (provider.enabled && (providerKey === 'vllm' || providerKey === 'litellm') && !provider.endpoint) {
      warnings.push(`${providerKey} enabled without endpoint; provider will be degraded`);
    }
  }

  if (!config.toggles.enable_ai_recommendations) {
    warnings.push('AI recommendations disabled (no automatic config mutation)');
  }

  return { config, warnings, errors, usingDefaults: false };
}
