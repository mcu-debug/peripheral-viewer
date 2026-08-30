/**
 * Copyright (C) 2023 Arm Limited
 * Copyright (C) 2026 Haneefdm
 * License: MIT
 */

export const PACKAGE_NAME = 'mcu-debug.peripheral-viewer';
export const CONFIG_SVD_PATH = 'svdPathConfig';
export const DEFAULT_SVD_CONFIGS = ['svdPath', 'svdFile'];
export const CONFIG_DEVICE = 'deviceConfig';
export const DEFAULT_DEVICE = 'deviceName';
export const CONFIG_PROCESSOR = 'processorConfig';
export const DEFAULT_PROCESSOR = 'processorName';
export const CONFIG_ADDRGAP = 'svdAddrGapThreshold';
export const DEFAULT_ADDRGAP = 0;
export const CONFIG_ASSET_PATH = 'packAssetUrl';
export const DEFAULT_ASSET_PATH = 'https://pack-content.cmsis.io';
export const CONFIG_SAVE_LAYOUT = 'saveLayout';
export const DEBUG_LEVEL = 'debugLevel';
export const CONFIG_PERIPHERALS = 'peripheralsConfig';
export const DEFAULT_PERIPHERALS = 'peripherals';
export const CONFIG_PERIPHERALS_CACHE_KEY = 'peripheralsCacheKeyConfig';
export const DEFAULT_PERIPHERALS_CACHE_KEY = 'peripheralsCacheKey';
export const CONFIG_MAX_READ_SIZE = 'maxReadSize';
export const CONFIG_ALIGNMENT = 'alignment';

// Following variables are configurable at runtime, but generally global in nature
export let MAX_READ_SIZE = 1024;
export let ALIGNMENT = 4;
export let ADDRGAP_THRESHOLD = DEFAULT_ADDRGAP;

export function setMaxReadSize(size: number): number {
    MAX_READ_SIZE = Math.max(4, Math.min(size, 4096));
    return MAX_READ_SIZE;
}

export function setAlignment(alignment: number): number {
    if (alignment < 0) {
        alignment = 0;
    } else if (alignment > 32) {
        alignment = 32;
    }
    ALIGNMENT = alignment;
    return ALIGNMENT;
}

export function setAddrGapThreshold(thresh: number): number {
    ADDRGAP_THRESHOLD = thresh;
    return ADDRGAP_THRESHOLD;
}
