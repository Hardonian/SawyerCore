export function validateManifest(manifest) {
    const required = ['id', 'name', 'version', 'entryPoint', 'permissions'];
    for (const field of required) {
        if (!manifest[field])
            return false;
    }
    return true;
}
