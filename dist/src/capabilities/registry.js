export class CapabilityRegistry {
    capabilities = new Map();
    register(capability) {
        this.capabilities.set(capability.id, capability);
    }
    getCapability(id) {
        return this.capabilities.get(id);
    }
    listCapabilities() {
        return Array.from(this.capabilities.values());
    }
    findCompatible(requirements) {
        const results = [];
        for (const cap of this.capabilities.values()) {
            if (requirements.provider && cap.provider !== requirements.provider)
                continue;
            if (requirements.offlineSupport && cap.offlineSupport !== requirements.offlineSupport)
                continue;
            results.push(cap);
        }
        return results;
    }
    unregister(id) {
        this.capabilities.delete(id);
    }
}
