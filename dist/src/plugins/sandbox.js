import vm from 'vm';
export class PluginSandbox {
    contexts = new Map();
    createSandbox(config) {
        const sandbox = {
            console: {
                log: (...args) => console.log(`[Plugin:${config.id}]`, ...args),
                error: (...args) => console.error(`[Plugin:${config.id}]`, ...args),
            },
            // Controlled access to AI capabilities would be passed here
            ...config.globals,
            process: {
                uptime: () => process.uptime(),
            },
        };
        const context = vm.createContext(sandbox);
        this.contexts.set(config.id, context);
        return context;
    }
    run(id, code) {
        const context = this.contexts.get(id);
        if (!context)
            throw new Error(`No sandbox context for plugin ${id}`);
        const script = new vm.Script(code);
        return script.runInContext(context, {
            timeout: 1000, // Hard timeout for plugin execution
        });
    }
    destroy(id) {
        this.contexts.delete(id);
    }
}
