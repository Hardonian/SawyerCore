import fs from 'fs';
import path from 'path';
import { PluginVerifier } from './verification.js';
export class PluginInstaller {
    pluginsDir;
    verifier = new PluginVerifier();
    constructor(pluginsDir) {
        this.pluginsDir = pluginsDir;
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
        }
    }
    async install(entry, zipContent) {
        const pluginPath = path.join(this.pluginsDir, entry.manifest.id);
        const backupPath = `${pluginPath}.backup`;
        try {
            // 1. Verify checksum
            if (!this.verifier.verifyChecksum(zipContent, entry.checksum)) {
                throw new Error('Checksum mismatch');
            }
            // 2. Backup existing version if any
            if (fs.existsSync(pluginPath)) {
                if (fs.existsSync(backupPath))
                    fs.rmSync(backupPath, { recursive: true });
                fs.renameSync(pluginPath, backupPath);
            }
            // 3. Create directory
            fs.mkdirSync(pluginPath, { recursive: true });
            // 4. Extract content (Simulated here since we don't have unzip lib, 
            // but in real app we'd use 'adm-zip' or similar)
            // For this implementation, we assume zipContent is actually the entry point file
            fs.writeFileSync(path.join(pluginPath, entry.manifest.entryPoint), zipContent);
            fs.writeFileSync(path.join(pluginPath, 'manifest.json'), JSON.stringify(entry.manifest, null, 2));
            // 5. Cleanup backup
            if (fs.existsSync(backupPath))
                fs.rmSync(backupPath, { recursive: true });
            console.log(`Plugin ${entry.manifest.id} installed successfully.`);
            return true;
        }
        catch (error) {
            console.error(`Installation failed for ${entry.manifest.id}:`, error);
            // Rollback
            if (fs.existsSync(backupPath)) {
                if (fs.existsSync(pluginPath))
                    fs.rmSync(pluginPath, { recursive: true });
                fs.renameSync(backupPath, pluginPath);
            }
            return false;
        }
    }
    async uninstall(id) {
        const pluginPath = path.join(this.pluginsDir, id);
        if (fs.existsSync(pluginPath)) {
            fs.rmSync(pluginPath, { recursive: true });
            return true;
        }
        return false;
    }
}
