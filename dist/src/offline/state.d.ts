export declare enum NetworkState {
    ONLINE = "ONLINE",
    OFFLINE = "OFFLINE",
    DEGRADED = "DEGRADED"
}
export interface OfflineState {
    network: NetworkState;
    lastSyncAt?: number;
    pendingTasks: number;
    isSyncing: boolean;
}
export declare function getOfflineState(): OfflineState;
export declare function setNetworkState(state: NetworkState): void;
export declare function updateOfflineStats(pending: number, syncing: boolean): void;
export declare function markSynced(): void;
