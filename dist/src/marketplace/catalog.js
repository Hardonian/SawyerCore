export class PluginCatalog {
    entries = new Map();
    register(entry) {
        this.entries.set(entry.manifest.id, entry);
    }
    getEntry(id) {
        return this.entries.get(id);
    }
    search(query) {
        const q = query.toLowerCase();
        const results = [];
        for (const e of this.entries.values()) {
            if (e.manifest.name.toLowerCase().includes(q) || e.manifest.description.toLowerCase().includes(q)) {
                results.push(e);
            }
        }
        return results;
    }
    list() {
        return Array.from(this.entries.values());
    }
}
