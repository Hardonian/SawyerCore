import { probeHardware } from '../../src/hardware/probe.js';
import { getHardwareProfile } from '../../src/hardware/profile.js';

async function verify() {
  console.log('--- Hardware Verification ---');
  const caps = await probeHardware();
  console.log('Capabilities:', JSON.stringify(caps, null, 2));
  
  const profile = getHardwareProfile(caps);
  console.log('Profile:', JSON.stringify(profile, null, 2));
  
  if (profile.canRunLocal) {
    console.log('✅ Local execution supported');
  } else {
    console.log('⚠️ Local execution restricted (low resources)');
  }
}

verify().catch(console.error);
