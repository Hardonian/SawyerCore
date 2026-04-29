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
    return Array.from(this.capabilities.values()).filter(cap => {
      if (requirements.provider && cap.provider !== requirements.provider) return false;
      if (requirements.offlineSupport && cap.offlineSupport !== requirements.offlineSupport) return false;
      return true;
    });
  }

  unregister(id: string) {
    this.capabilities.delete(id);
  }
}
