export enum OfflineSupportLevel {
  FULL = 'FULL',           // Runs fully offline
  PARTIAL = 'PARTIAL',     // Limited functionality offline
  NONE = 'NONE',           // Requires online connection
  DEGRADED = 'DEGRADED'    // Falls back to simpler model/logic
}

export interface CostProfile {
  computeUnits: number;
  tokensPerUnit?: number;
  estimatedUSD: number;
}

export interface HardwareRequirements {
  minCores: number;
  minMemoryMB: number;
  gpuRequired: boolean;
  minVRAMMB?: number;
}

export interface Capability {
  id: string;
  name: string;
  provider: 'CORE' | 'PLUGIN' | 'REMOTE';
  requiredPermissions: string[];
  supportedStates: string[];
  costProfile: CostProfile;
  hardwareRequirements: HardwareRequirements;
  offlineSupport: OfflineSupportLevel;
  testCoverageStatus: 'STABLE' | 'EXPERIMENTAL' | 'UNTESTED';
}
