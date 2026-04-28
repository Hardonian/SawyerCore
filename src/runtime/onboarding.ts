export type DeviceType = 'laptop' | 'desktop' | 'workstation' | 'server' | 'android-phone' | 'mini-pc' | 'nas';
export type OSType = 'Windows' | 'WSL' | 'Linux' | 'macOS' | 'Android';

export interface DeviceInventory {
  deviceType: DeviceType;
  os: OSType;
  cpuCores: number;
  ramGb: number;
  hasGpu: boolean;
  vramGb: number;
  hasNpu: boolean;
  batterySensitive: boolean;
  thermalSensitive: boolean;
  privacyPreference: 'strict' | 'balanced' | 'permissive';
  budgetPreference: 'low' | 'medium' | 'high';
  speedVsQuality: 'speed' | 'balanced' | 'quality';
  mode: 'local-first' | 'cloud-assisted';
}

export function recommendProfile(inventory: DeviceInventory): string {
  if (inventory.os === 'Android' || inventory.deviceType === 'android-phone') return 'mobile-edge';
  if (inventory.privacyPreference === 'strict' || inventory.mode === 'local-first') return 'local-safe';
  if (inventory.speedVsQuality === 'quality' && inventory.hasGpu && inventory.vramGb >= 12) return 'performance';
  if (inventory.budgetPreference === 'low') return 'cost-saver';
  return 'balanced';
}
