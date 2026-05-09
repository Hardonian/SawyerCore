import { CatalogEntry } from './catalog.js';
export declare class PluginInstaller {
    private pluginsDir;
    private verifier;
    constructor(pluginsDir: string);
    install(entry: CatalogEntry, zipContent: Buffer): Promise<boolean>;
    uninstall(id: string): Promise<boolean>;
}
