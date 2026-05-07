export var NetworkState;
(function (NetworkState) {
    NetworkState["ONLINE"] = "ONLINE";
    NetworkState["OFFLINE"] = "OFFLINE";
    NetworkState["DEGRADED"] = "DEGRADED";
})(NetworkState || (NetworkState = {}));
let currentState = {
    network: NetworkState.ONLINE,
    pendingTasks: 0,
    isSyncing: false
};
export function getOfflineState() {
    return { ...currentState };
}
export function setNetworkState(state) {
    currentState.network = state;
}
export function updateOfflineStats(pending, syncing) {
    currentState.pendingTasks = pending;
    currentState.isSyncing = syncing;
}
export function markSynced() {
    currentState.lastSyncAt = Date.now();
    currentState.pendingTasks = 0;
    currentState.isSyncing = false;
}
