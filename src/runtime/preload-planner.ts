export interface PreloadInput {
  profile: string;
  availableMemoryGb: number;
  batteryPercent: number;
  recentUsage: Record<string, number>;
  taskPriorities: string[];
}

export interface PreloadPlan {
  startup: string[];
  lazyLoad: string[];
  unloadUnderPressure: string[];
  mobileSync: string[];
  keepWarmProviders: string[];
}

export function buildPreloadPlan(input: PreloadInput): PreloadPlan {
  const startup = input.availableMemoryGb >= 24 ? ['chat', 'code', 'embeddings'] : ['chat'];
  if (input.profile === 'mobile-edge' || input.batteryPercent < 30) startup.splice(1);
  const lazyLoad = input.taskPriorities.filter((t) => !startup.includes(t));
  return {
    startup,
    lazyLoad,
    unloadUnderPressure: ['code', 'vision'],
    mobileSync: input.profile === 'mobile-edge' ? ['classification', 'embeddings', 'summarization'] : [],
    keepWarmProviders: input.profile === 'performance' ? ['vllm', 'litellm'] : ['onnx']
  };
}
