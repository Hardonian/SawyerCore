import { cpus, totalmem } from 'node:os';
import { writeFileSync } from 'node:fs';
import { safeDefaultConfig } from '../runtime/defaults.js';
import { recommendProfile, type DeviceInventory } from '../runtime/onboarding.js';
import { generateDeterministicRecommendation } from '../runtime/recommendation-engine.js';

function detectInventory(): DeviceInventory {
  const ramGb = Math.round(totalmem() / 1024 / 1024 / 1024);
  return {
    deviceType: 'workstation',
    os: process.platform === 'darwin' ? 'macOS' : 'Linux',
    cpuCores: cpus().length,
    ramGb,
    hasGpu: false,
    vramGb: 0,
    hasNpu: false,
    batterySensitive: false,
    thermalSensitive: false,
    privacyPreference: 'strict',
    budgetPreference: 'medium',
    speedVsQuality: 'balanced',
    mode: 'local-first'
  };
}

const auto = process.argv.includes('--auto');
const inventory = detectInventory();
const recommendation = generateDeterministicRecommendation(inventory);
const config = safeDefaultConfig();
config.profile = auto ? recommendation.profile : recommendProfile(inventory);

writeFileSync('sawyer.config.json', JSON.stringify(config, null, 2));
writeFileSync(
  '.env.sawyer.example',
  ['VLLM_BASE_URL=http://localhost:8000/v1', 'LITELLM_BASE_URL=http://localhost:4000', 'CLOUD_API_KEY=', 'SAWYER_AI_RECOMMENDATIONS=false'].join('\n')
);

console.log(`Generated sawyer.config.json with profile=${config.profile}`);
console.log('Generated .env.sawyer.example (cloud keys optional for local-first).');
console.log('Next: npm run sawyer:doctor');
