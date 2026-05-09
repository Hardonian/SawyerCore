export enum NetworkState {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  DEGRADED = 'DEGRADED'
}

export interface OfflineState {
  network: NetworkState;
  lastSyncAt?: number;
  pendingTasks: number;
  isSyncing: boolean;
}

let currentState: OfflineState = {
  network: NetworkState.ONLINE,
  pendingTasks: 0,
  isSyncing: false
};

export function getOfflineState(): OfflineState {
  return { ...currentState };
}

export function setNetworkState(state: NetworkState) {
  currentState.network = state;
}

export function updateOfflineStats(pending: number, syncing: boolean) {
  currentState.pendingTasks = pending;
  currentState.isSyncing = syncing;
}

export function markSynced() {
  currentState.lastSyncAt = Date.now();
  currentState.pendingTasks = 0;
  currentState.isSyncing = false;
}
