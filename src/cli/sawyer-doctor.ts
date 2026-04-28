import { existsSync, readFileSync } from 'node:fs';
import { totalmem } from 'node:os';
import { safeDefaultConfig } from '../runtime/defaults.js';
import type { SawyerConfig } from '../types/config.js';

type Check = { name: string; ok: boolean; details: string; fix?: string; unsafe?: boolean };

const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');

function loadConfig(): SawyerConfig {
  if (!existsSync('sawyer.config.json')) return safeDefaultConfig();
  return JSON.parse(readFileSync('sawyer.config.json', 'utf8')) as SawyerConfig;
}

async function endpointCheck(name: string, url: string | undefined, timeoutMs: number): Promise<Check> {
  if (!url) {
    return { name, ok: false, details: 'not configured', fix: `Set ${name} endpoint in sawyer.config.json` };
  }
  const healthUrl = url.includes('/v1') ? `${url.replace(/\/$/, '').replace(/\/v1$/, '')}/health` : `${url.replace(/\/$/, '')}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    if (!response.ok) {
      return { name, ok: false, details: `HTTP ${response.status} at ${healthUrl}`, fix: `Start ${name} server or update endpoint` };
    }
    return { name, ok: true, details: `reachable at ${healthUrl}` };
  } catch (error) {
    return { name, ok: false, details: `unreachable (${(error as Error).message})`, fix: `Start ${name} service locally` };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const checks: Check[] = [];

  checks.push({ name: 'config validity', ok: Boolean(cfg.version && cfg.providers && cfg.policy), details: `profile=${cfg.profile}`, unsafe: !(cfg.version && cfg.providers && cfg.policy) });
  checks.push({ name: 'selected profile', ok: ['local-safe', 'balanced', 'performance', 'mobile-edge', 'cost-saver', 'developer'].includes(cfg.profile), details: cfg.profile, unsafe: !['local-safe', 'balanced', 'performance', 'mobile-edge', 'cost-saver', 'developer'].includes(cfg.profile), fix: 'Use sawyer config init to regenerate safe profile' });
  checks.push({ name: 'private-mode cloud safety', ok: !(cfg.toggles.enable_private_mode && cfg.providers.cloud.enabled), details: `private_mode=${cfg.toggles.enable_private_mode} cloud=${cfg.providers.cloud.enabled}`, unsafe: cfg.toggles.enable_private_mode && cfg.providers.cloud.enabled, fix: 'Disable cloud when private mode enabled' });

  checks.push(await endpointCheck('vllm', cfg.providers.vllm.endpoint, cfg.providers.vllm.timeoutMs));
  checks.push(await endpointCheck('litellm', cfg.providers.litellm.endpoint, cfg.providers.litellm.timeoutMs));
  checks.push(await endpointCheck('llama.cpp', cfg.providers.llamaCpp.endpoint, cfg.providers.llamaCpp.timeoutMs));

  const memGb = Math.round(totalmem() / 1024 / 1024 / 1024);
  checks.push({ name: 'memory availability', ok: memGb >= 8, details: `${memGb} GB detected`, fix: 'Use low-memory profile if under 8GB' });
  checks.push({ name: 'policy conflicts', ok: cfg.policy.requireAudit && cfg.policy.maxTokens > 0, details: `requireAudit=${cfg.policy.requireAudit} maxTokens=${cfg.policy.maxTokens}`, unsafe: !cfg.policy.requireAudit || cfg.policy.maxTokens <= 0, fix: 'Enable audit and positive maxTokens' });
  checks.push({ name: 'cloud safety', ok: !cfg.providers.cloud.enabled || Boolean(cfg.providers.cloud.apiKeyEnv), details: cfg.providers.cloud.enabled ? `cloud enabled with apiKeyEnv=${cfg.providers.cloud.apiKeyEnv ?? 'none'}` : 'cloud disabled', unsafe: cfg.providers.cloud.enabled && !cfg.providers.cloud.apiKeyEnv, fix: 'Set cloud apiKeyEnv or disable cloud provider' });

  if (jsonMode) {
    console.log(JSON.stringify({ checks }, null, 2));
  } else {
    for (const check of checks) {
      const status = check.ok ? 'OK  ' : check.unsafe ? 'FAIL' : 'WARN';
      const fix = check.fix ? ` | fix: ${check.fix}` : '';
      console.log(`${status} | ${check.name.padEnd(24)} | ${check.details}${fix}`);
    }
  }

  const hasUnsafe = checks.some((c) => c.unsafe && !c.ok);
  process.exit(hasUnsafe ? 1 : 0);
}

await main();
