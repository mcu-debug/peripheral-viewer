/**
 * Copyright (C) 2023 Arm Limited
 */

/**
 * Interface describing raw PDSC data returned from xml2js
 */
export interface PDSC {
    package: {
        devices?: Array<{
            family: DeviceFamily[];
        }>;
    };
}

export interface DeviceProperties {
    processor?: Array<{
        $: {
            Pname: string;
            Punits: string;
            Dclock: string;
            DcoreVersion: string;
        };
    }>;
    debug?: Array<{
        $?: {
            __dp?: string;
            __ap?: string;
            __apid?: string;
            address?: string;
            svd?: string;
            Pname?: string;
            Punit?: string;
            defaultResetSequence?: string;
        };
    }>;
}

export interface DeviceVariant extends DeviceProperties {
    $: {
        Dvariant: string;
        Dname: string;
    };
}

export interface Device extends DeviceProperties {
    $: {
        Dname: string;
    };
    variant?: DeviceVariant[];
}

export interface DeviceSubFamily extends DeviceProperties {
    $: {
        DsubFamily: string;
    };
    device?: Device[];
}

export interface DeviceFamily extends DeviceProperties {
    $: {
        Dfamily: string;
        Dvendor: string;
    };
    subFamily?: DeviceSubFamily[];
    device?: Device[];
}

// Return whether an item is an object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isObject = (item: any): boolean => item && typeof item === 'object' && !Array.isArray(item);

// Merge two objects recursively, with source overwriting target when there's a conflict
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deepMerge = <T extends { [key: string]: any }>(target: { [key: string]: any }, source: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = Object.assign({} as any, target);

    Object.keys(source).forEach(key => {
        if (isObject(source[key]) && key in target) {
            output[key] = deepMerge(target[key], source[key]);
        } else {
            Object.assign(output, { [key]: source[key] });
        }
    });

    return output;
};

// Recurse DeviceFamily and DeviceSubFamily to find Devices and DeviceVariants, merging them as we go
export const getDevices = (pack: PDSC): Array<Device | DeviceVariant> => {
    const result: Device[] = [];

    const addDevice = (device: Device, parent: DeviceProperties = {}) => {
        const entry = deepMerge(parent, device);
        result.push(entry);
    };

    const walkDevices = (devices?: Device[], parent: DeviceProperties = {}) => {
        if (devices) {
            for (const device of devices) {
                if (device.variant) {
                    // If there are variants, add them instead of the parent device
                    for (const variant of device.variant) {
                        // Merge in device
                        const variantParent = deepMerge(parent, device);
                        addDevice(variant, variantParent);
                    }
                } else {
                    addDevice(device, parent);
                }
            }
        }
    };

    // Walk the DeviceFamily array
    if (pack.package.devices) {
        for (const device of pack.package.devices) {
            for (const family of device.family) {
                walkDevices(family.device, family);

                // Walk the DeviceSubFamily array
                if (family.subFamily) {
                    for (const sub of family.subFamily) {
                        const parent = deepMerge(family, sub);
                        walkDevices(sub.device, parent);
                    }
                }
            }
        }
    }

    return result;
};

/**
 * Return list of processor names available for specified device
 */
export const getProcessors = (device: Device): string[] => {
    const processors: string[] = [];

    if (device.processor) {
        for (const processor of device.processor) {
            if (processor.$ && processor.$.Pname) {
                processors.push(processor.$.Pname);
            }
        }
    }

    return processors;
};

/**
 * Return svd path (or undefined) for specified device
 * If processorName specified, matching svd file is returned, else the first one
 */
export const getSvdPath = (device: Device, processorName?: string): string | undefined => {
    if (device.debug) {
        const filtered = filterByProcessor(device.debug, processorName);
        for (const debug of filtered) {
            if (debug.$ && debug.$.svd) {
                return debug.$.svd;
            }
        }
    }

    return undefined;
};

const filterByProcessor = <T extends { $?: { Pname?: string } }>(theArray: T[], processorName: string | undefined): T[] => {
    // If processorName not specified, return all items
    if (!processorName) {
        return theArray;
    }

    return filter(theArray, item => item.$?.Pname === processorName) as T[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filter = <T extends { $?: { [key: string]: any } }>(theArray: T[], predicate: (item: T) => boolean): T[] => {
    const filtered = theArray.filter(item => item.$ && predicate(item));

    // If no items match, return them all
    return filtered.length > 0 ? filtered as T[] : theArray;
};
