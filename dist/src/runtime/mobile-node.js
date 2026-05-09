export class MobileNodeRegistry {
    nodes = new Map();
    register(node) {
        this.nodes.set(node.id, node);
    }
    heartbeat(id, batteryPercent, thermalState) {
        const node = this.nodes.get(id);
        if (!node)
            return;
        node.batteryPercent = batteryPercent;
        node.thermalState = thermalState;
        node.lastHeartbeatMs = Date.now();
    }
    eligibleForNpuTask() {
        return [...this.nodes.values()].find((n) => n.hasNpu && n.batteryPercent >= 20 && n.thermalState !== 'hot');
    }
}
