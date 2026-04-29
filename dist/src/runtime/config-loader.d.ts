import { type SawyerConfig } from '../types/config.js';
export interface ConfigLoadResult {
    config: SawyerConfig;
    warnings: string[];
    errors: string[];
    usingDefaults: boolean;
}
export declare function loadSawyerConfig(path?: string): ConfigLoadResult;
