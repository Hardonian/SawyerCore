import { PluginVerifier } from '../../src/marketplace/verification.js';
import { validateManifest } from '../../src/plugins/manifest.js';

async function verify() {
  console.log('--- Plugin Verification ---');
  
  const verifier = new PluginVerifier();
  
  const validManifest = {
    id: 'test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    entryPoint: 'index.js',
    permissions: {
      network: true,
      filesystem: 'READ',
      canInvokeAI: true,
      maxMemoryMB: 128,
      maxCPUPatencyMs: 100
    }
  };

  const result = verifier.verifyManifest(validManifest);
  console.log('Manifest Verification:', result);
  
  if (result.valid && validateManifest(validManifest)) {
    console.log('✅ Plugin manifest verification successful');
  } else {
    throw new Error('Plugin verification failure');
  }

  // Test invalid manifest
  const invalidManifest = { id: 'test' };
  const invalidResult = verifier.verifyManifest(invalidManifest);
  if (!invalidResult.valid) {
    console.log('✅ Invalid manifest correctly rejected');
  } else {
    throw new Error('Invalid manifest was not rejected');
  }
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
