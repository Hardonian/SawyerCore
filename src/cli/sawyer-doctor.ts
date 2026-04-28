import { existsSync, readFileSync } from 'node:fs';

function report(label: string, ok: boolean, details: string): void {
  console.log(`${ok ? 'OK' : 'WARN'} ${label}: ${details}`);
}

const hasConfig = existsSync('sawyer.config.json');
report('config', hasConfig, hasConfig ? 'found' : 'missing');
if (!hasConfig) process.exit(0);

const config = JSON.parse(readFileSync('sawyer.config.json', 'utf8')) as any;
report('vLLM endpoint', Boolean(config.providers?.vllm?.endpoint), config.providers?.vllm?.endpoint ?? 'not set');
report('LiteLLM endpoint', Boolean(config.providers?.litellm?.endpoint), config.providers?.litellm?.endpoint ?? 'not set');
report('model recommendations', existsSync('config/model-recommendations.json'), 'task matrix present');
report('policy conflict', !(config.toggles?.enable_private_mode && config.toggles?.enable_cloud_fallback), 'private mode + cloud fallback');
report('fallback safety', config.profile === 'local-safe' ? !config.toggles?.enable_cloud_fallback : true, 'cloud fallback default in local-safe');
report('unsafe cloud settings', !config.providers?.cloud?.enabled || config.policy?.cloudEgressAllowedFor?.length > 0, 'cloud route constrained');
