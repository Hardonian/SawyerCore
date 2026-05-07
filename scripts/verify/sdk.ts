import { SawyerClient } from '../../sdk/client.js';

async function verify() {
  console.log('--- SDK Verification ---');
  
  const client = new SawyerClient('test-key', 'http://localhost:invalid');
  
  // This should fail gracefully with a 'FAILURE' status
  console.log('Testing task invocation with invalid endpoint...');
  const result = await client.invokeTask('test', { foo: 'bar' });
  
  console.log('SDK Result:', result);
  
  if (result.status === 'FAILURE') {
    console.log('✅ SDK handled connection failure correctly');
  } else {
    throw new Error('SDK failed to handle failure');
  }
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
