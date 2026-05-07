export function recommendProfile(inventory) {
    if (inventory.os === 'Android' || inventory.deviceType === 'android-phone')
        return 'mobile-edge';
    if (inventory.privacyPreference === 'strict' || inventory.mode === 'local-first')
        return 'local-safe';
    if (inventory.speedVsQuality === 'quality' && inventory.hasGpu && inventory.vramGb >= 12)
        return 'performance';
    if (inventory.budgetPreference === 'low')
        return 'cost-saver';
    return 'balanced';
}
