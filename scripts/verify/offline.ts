import { setNetworkState, NetworkState } from '../../src/offline/state.js';
import { enqueueTask, getPendingTasks } from '../../src/offline/queue.js';
import { OfflineSync } from '../../src/offline/sync.js';

async function verify() {
  console.log('--- Offline Verification ---');
  
  // 1. Simulate transition to offline
  setNetworkState(NetworkState.OFFLINE);
  console.log('Network state set to OFFLINE');

  // 2. Queue a task
  const task = enqueueTask('test-task', { data: 123 }, 'trace-abc');
  console.log(`Task queued: ${task.id}`);
  
  const pending = getPendingTasks();
  if (pending.length === 1) {
    console.log('✅ Task successfully queued');
  } else {
    throw new Error('Task queue failure');
  }

  // 3. Simulate sync
  const syncer = new OfflineSync();
  syncer.registerHandler('test-task', async (t) => {
    console.log(`Syncing task ${t.id}...`);
    return true;
  });

  const result = await syncer.sync();
  console.log('Sync result:', result);

  if (result.success === 1 && getPendingTasks().length === 0) {
    console.log('✅ Offline sync successful');
  } else {
    throw new Error('Offline sync failure');
  }
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
