import { PluginManifest } from '../plugins/manifest.js';

export interface CatalogEntry {
  manifest: PluginManifest;
  downloadUrl: string;
  checksum: string;
  publishedAt: number;
  verified: boolean;
}

export class PluginCatalog {
  private entries: Map<string, CatalogEntry> = new Map();

  register(entry: CatalogEntry) {
    this.entries.set(entry.manifest.id, entry);
  }

  getEntry(id: string): CatalogEntry | undefined {
    return this.entries.get(id);
  }

  search(query: string): CatalogEntry[] {
    const q = query.toLowerCase();
    return Array.from(this.entries.values()).filter(e => 
      e.manifest.name.toLowerCase().includes(q) || 
      e.manifest.description.toLowerCase().includes(q)
    );
  }

  list(): CatalogEntry[] {
    return Array.from(this.entries.values());
  }
}
