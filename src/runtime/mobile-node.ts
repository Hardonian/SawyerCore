export interface MobileNode {
  id: string;
  hasNpu: boolean;
  batteryPercent: number;
  thermalState: 'nominal' | 'warm' | 'hot';
  capabilities: string[];
  lastHeartbeatMs: number;
}

export class MobileNodeRegistry {
  private readonly nodes = new Map<string, MobileNode>();

  register(node: MobileNode): void {
    this.nodes.set(node.id, node);
  }

  heartbeat(id: string, batteryPercent: number, thermalState: 'nominal' | 'warm' | 'hot'): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.batteryPercent = batteryPercent;
    node.thermalState = thermalState;
    node.lastHeartbeatMs = Date.now();
  }

  eligibleForNpuTask(): MobileNode | undefined {
    return [...this.nodes.values()].find((n) => n.hasNpu && n.batteryPercent >= 20 && n.thermalState !== 'hot');
  }
}
