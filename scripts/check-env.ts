import { execSync } from 'child_process';

console.log('--- Sawyer Environment Check ---');

const check = (cmd: string, name: string) => {
  try {
    const version = execSync(cmd, { stdio: 'pipe' }).toString().trim();
    console.log(`✅ ${name}: ${version}`);
    return true;
  } catch {
    console.log(`❌ ${name}: NOT FOUND`);
    return false;
  }
};

const nodeOk = check('node --version', 'Node.js');
const npmOk = check('npm --version', 'NPM');
const cargoOk = check('cargo --version', 'Rust/Cargo');

console.log('-------------------------------');

if (!nodeOk || !npmOk) {
  console.error('CRITICAL: Node.js and NPM are required.');
  process.exit(1);
}

if (!cargoOk) {
  console.warn('WARNING: Rust/Cargo not found. Native modules will be skipped.');
}

console.log('Environment validation complete.');
