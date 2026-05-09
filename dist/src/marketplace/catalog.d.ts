import { PluginManifest } from '../plugins/manifest.js';
export interface CatalogEntry {
    manifest: PluginManifest;
    downloadUrl: string;
    checksum: string;
    publishedAt: number;
    verified: boolean;
}
export declare class PluginCatalog {
    private entries;
    register(entry: CatalogEntry): void;
    getEntry(id: string): CatalogEntry | undefined;
    search(query: string): CatalogEntry[];
    list(): CatalogEntry[];
}
