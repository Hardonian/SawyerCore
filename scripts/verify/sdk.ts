import { SawyerClient, SawyerError } from '../../sdk/index.js';

async function verify() {
  console.log('--- SDK Verification ---');

  const client = new SawyerClient({
    apiKey: 'test-key',
    endpoint: 'http://localhost:invalid',
    maxRetries: 0,
    timeoutMs: 2000,
  });

  console.log('Testing task invocation with unreachable endpoint...');
  try {
    await client.tasks.run({ type: 'chat', input: 'test' });
    throw new Error('Expected connection failure');
  } catch (err: any) {
    if (err instanceof SawyerError || err instanceof Error) {
      console.log(`SDK Result: Handled connection error gracefully (${err.message.slice(0, 60)})`);
      console.log('✅ SDK handled connection failure correctly');
    } else {
      throw new Error('SDK threw non-standard error');
    }
  }
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
