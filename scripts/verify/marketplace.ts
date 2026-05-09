import { PluginInstaller } from '../../src/marketplace/install.js';
import { CatalogEntry } from '../../src/marketplace/catalog.js';
import path from 'path';
import fs from 'fs';

async function verify() {
  console.log('--- Marketplace Verification ---');
  
  const testDir = path.join(process.cwd(), '.sawyer', 'test-plugins');
  const installer = new PluginInstaller(testDir);
  
  const entry: CatalogEntry = {
    manifest: {
      id: 'verify.test',
      name: 'Verify Test',
      version: '1.0.0',
      description: 'test',
      author: 'test',
      entryPoint: 'index.js',
      permissions: {
        network: false,
        filesystem: 'NONE',
        canInvokeAI: false,
        maxMemoryMB: 64,
        maxCPUPatencyMs: 100
      },
      runtimeHooks: [],
      resourceLimits: { cpuLimit: 0.1, memoryLimit: 128 }
    },
    downloadUrl: 'local',
    checksum: '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5',
    publishedAt: Date.now(),
    verified: true
  };

  const content = Buffer.from('console.log("hello")');
  
  console.log('Testing installation...');
  const success = await installer.install(entry, content);
  
  if (success && fs.existsSync(path.join(testDir, 'verify.test'))) {
    console.log('✅ Plugin installation verified');
  } else {
    throw new Error('Installation failure');
  }

  console.log('Testing uninstallation...');
  await installer.uninstall('verify.test');
  if (!fs.existsSync(path.join(testDir, 'verify.test'))) {
    console.log('✅ Plugin uninstallation verified');
  } else {
    throw new Error('Uninstallation failure');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
