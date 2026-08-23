/**
 * Offline Edge Worker Example
 * Demonstrates how an edge IoT / robotics node operates with zero internet access,
 * queues sensor tasks locally, and syncs when connectivity is restored.
 */

import { OfflineQueue } from '../../src/offline/queue.js';
import { SyncManager } from '../../src/offline/sync.js';
import { NetworkMonitor } from '../../src/offline/network.js';

async function main() {
  console.log('=== Starting Sawyer Offline Edge Worker ===');

  const network = new NetworkMonitor();
  const queue = new OfflineQueue();
  const syncManager = new SyncManager(queue, network);

  // 1. Simulate device going offline (e.g. drone flight or underground sensor)
  console.log('\n[1] Simulating network disconnection...');
  network.setOffline();

  // 2. Queue local inference jobs during disconnected state
  console.log('\n[2] Queueing sensor tasks while offline:');
  const task1 = queue.enqueue('sensor_anomaly_check', {
    sensorId: 'sensor-temp-04',
    reading: 88.4,
    unit: 'celsius',
    timestamp: Date.now(),
  });
  console.log(`- Queued task ${task1.id} (status: ${task1.status})`);

  const task2 = queue.enqueue('vibration_analysis', {
    sensorId: 'accel-joint-02',
    frequencyHz: 440,
    amplitude: 0.12,
    timestamp: Date.now(),
  });
  console.log(`- Queued task ${task2.id} (status: ${task2.status})`);

  console.log(`\nTotal offline tasks pending: ${queue.getPendingCount()}`);

  // 3. Network reconnects
  console.log('\n[3] Network connection restored. Triggering sync...');
  network.setOnline();

  // 4. Process queue synchronization
  const syncResult = await syncManager.sync();
  console.log(`Sync completed: ${syncResult.success} synced, ${syncResult.failed} failed.`);
  console.log(`Remaining pending: ${queue.getPendingCount()}`);
  console.log('\n✅ Offline edge worker cycle completed nominal.');
}

main().catch(console.error);
