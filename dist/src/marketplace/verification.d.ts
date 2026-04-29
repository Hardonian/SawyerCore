export interface VerificationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    permissionsRequested: string[];
}
export declare class PluginVerifier {
    verifyManifest(manifest: any): VerificationResult;
    verifyChecksum(content: Buffer, expected: string): boolean;
    verifySignature(_content: Buffer, _signature: string, _publicKey: string): boolean;
}
