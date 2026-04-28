import { loadSawyerConfig } from '../runtime/config-loader.js';
import { VllmProvider, LiteLLMProvider } from '../providers/providers.js';

interface DoctorCheck {
  name: string;
  status: 'OK' | 'WARN' | 'FAIL';
  details: string;
}

function formatTable(checks: DoctorCheck[]): string {
  const longestName = Math.max(...checks.map((c) => c.name.length), 'check'.length);
  const longestStatus = 6;
  const head = `${'check'.padEnd(longestName)}  ${'status'.padEnd(longestStatus)}  details`;
  const sep = `${'-'.repeat(longestName)}  ${'-'.repeat(longestStatus)}  ${'-'.repeat(40)}`;
  const rows = checks.map((c) => `${c.name.padEnd(longestName)}  ${c.status.padEnd(longestStatus)}  ${c.details}`);
  return [head, sep, ...rows].join('\n');
}

async function run(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const loaded = loadSawyerConfig();
  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'config',
    status: loaded.usingDefaults ? 'WARN' : loaded.errors.length > 0 ? 'FAIL' : 'OK',
    details: loaded.usingDefaults ? 'missing config; local-safe defaults active' : loaded.errors.length > 0 ? loaded.errors.join(' | ') : 'loaded'
  });

  checks.push({ name: 'profile', status: 'OK', details: loaded.config.profile });
  checks.push({
    name: 'toggles',
    status: 'OK',
    details: Object.entries(loaded.config.toggles)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(', ')
  });

  const vllm = new VllmProvider(loaded.config.providers.vllm);
  const litellm = new LiteLLMProvider(loaded.config.providers.litellm);
  const [vllmHealth, litellmHealth] = await Promise.all([vllm.healthCheck(), litellm.healthCheck()]);

  checks.push({
    name: 'vllm endpoint',
    status: vllmHealth.healthy ? 'OK' : loaded.config.providers.vllm.enabled ? 'WARN' : 'OK',
    details: vllmHealth.healthy ? `reachable, models=${(vllmHealth.models ?? []).length}` : vllmHealth.reason ?? 'unhealthy'
  });
  checks.push({
    name: 'litellm endpoint',
    status: litellmHealth.healthy ? 'OK' : loaded.config.providers.litellm.enabled ? 'WARN' : 'OK',
    details: litellmHealth.healthy ? `reachable, models=${(litellmHealth.models ?? []).length}` : litellmHealth.reason ?? 'unhealthy'
  });

  checks.push({
    name: 'request-size-limit',
    status: loaded.config.policy.maxRequestBytes > 0 ? 'OK' : 'FAIL',
    details: `${loaded.config.policy.maxRequestBytes} bytes`
  });

  checks.push({
    name: 'cloud fallback',
    status: loaded.config.toggles.enable_cloud_fallback ? 'WARN' : 'OK',
    details: loaded.config.toggles.enable_cloud_fallback ? 'enabled' : 'disabled'
  });

  checks.push({
    name: 'private-mode-deny',
    status: loaded.config.toggles.enable_private_mode && loaded.config.toggles.enable_cloud_fallback ? 'FAIL' : 'OK',
    details: loaded.config.toggles.enable_private_mode ? 'private mode active' : 'private mode disabled'
  });

  checks.push({
    name: 'unsafe conflicts',
    status: loaded.errors.length > 0 ? 'FAIL' : 'OK',
    details: loaded.errors.length > 0 ? loaded.errors.join(' | ') : 'none'
  });

  for (const warning of loaded.warnings) {
    checks.push({ name: 'warning', status: 'WARN', details: warning });
  }

  const hasFail = checks.some((c) => c.status === 'FAIL');

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ checks, degraded: checks.some((c) => c.status === 'WARN'), ok: !hasFail }, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTable(checks)}\n`);
  }

  process.exit(hasFail ? 2 : 0);
}

run();
