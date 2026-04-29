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
    const results: CatalogEntry[] = [];
    for (const e of this.entries.values()) {
      if (e.manifest.name.toLowerCase().includes(q) || e.manifest.description.toLowerCase().includes(q)) {
        results.push(e);
      }
    }
    return results;
  }

  list(): CatalogEntry[] {
    return Array.from(this.entries.values());
  }
}
