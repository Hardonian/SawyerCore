export interface MobileNode {
    id: string;
    hasNpu: boolean;
    batteryPercent: number;
    thermalState: 'nominal' | 'warm' | 'hot';
    capabilities: string[];
    lastHeartbeatMs: number;
}
export declare class MobileNodeRegistry {
    private readonly nodes;
    register(node: MobileNode): void;
    heartbeat(id: string, batteryPercent: number, thermalState: 'nominal' | 'warm' | 'hot'): void;
    eligibleForNpuTask(): MobileNode | undefined;
}
