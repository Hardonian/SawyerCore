export interface HealthReport {
    nodeId: string;
    cpuUsage: number;
    memoryUsage: number;
    activeTasks: number;
    timestamp: number;
    signature: string;
}
export declare class HealthMonitor {
    private static MAX_SILENCE_MS;
    static processHeartbeat(report: HealthReport): Promise<boolean>;
    static checkStaleNodes(): void;
    private static verifySignature;
}
