export function buildPreloadPlan(input) {
    const startup = input.availableMemoryGb >= 24 ? ['chat', 'code', 'embeddings'] : ['chat'];
    if (input.profile === 'mobile-edge' || input.batteryPercent < 30)
        startup.splice(1);
    const lazyLoad = input.taskPriorities.filter((t) => !startup.includes(t));
    return {
        startup,
        lazyLoad,
        unloadUnderPressure: ['code', 'vision'],
        mobileSync: input.profile === 'mobile-edge' ? ['classification', 'embeddings', 'summarization'] : [],
        keepWarmProviders: input.profile === 'performance' ? ['vllm', 'litellm'] : ['onnx']
    };
}
