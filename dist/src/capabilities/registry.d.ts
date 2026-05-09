import { Capability } from './types.js';
export declare class CapabilityRegistry {
    private capabilities;
    register(capability: Capability): void;
    getCapability(id: string): Capability | undefined;
    listCapabilities(): Capability[];
    findCompatible(requirements: Partial<Capability>): Capability[];
    unregister(id: string): void;
}
