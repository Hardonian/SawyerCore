import { Capability } from './types.js';

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  register(capability: Capability) {
    this.capabilities.set(capability.id, capability);
  }

  getCapability(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  listCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  findCompatible(requirements: Partial<Capability>): Capability[] {
    const results: Capability[] = [];
    for (const cap of this.capabilities.values()) {
      if (requirements.provider && cap.provider !== requirements.provider) continue;
      if (requirements.offlineSupport && cap.offlineSupport !== requirements.offlineSupport) continue;
      results.push(cap);
    }
    return results;
  }

  unregister(id: string) {
    this.capabilities.delete(id);
  }
}
