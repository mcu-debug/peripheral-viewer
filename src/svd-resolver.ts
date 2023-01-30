/**
 * Copyright (C) 2023 Arm Limited
 */

import * as vscode from 'vscode';
import * as manifest from './manifest';
import { isAbsolute, join, normalize } from 'path';
import { parseStringPromise } from 'xml2js';
import { SvdRegistry } from './svd-registry';
import { parsePackString, pdscFromPack, fileFromPack, Pack } from './cmsis-pack/pack-utils';
import { PDSC, Device, DeviceVariant, getDevices, getSvdPath, getProcessors } from './cmsis-pack/pdsc';
import { readFromUrl } from './utils';
import { getSelection } from './vscode-utils';

export class SvdResolver {
    public constructor(protected registry: SvdRegistry) {
    }

    public async resolve(session: vscode.DebugSession, wsFolderPath?: vscode.Uri): Promise<string | undefined> {
        const svdConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_SVD_PATH) || manifest.DEFAULT_SVD_PATH;
        let svdPath = session.configuration[svdConfig];

        const deviceConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_DEVICE) || manifest.DEFAULT_DEVICE;
        const deviceName = session.configuration[deviceConfig];

        const processorConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_PROCESSOR) || manifest.DEFAULT_PROCESSOR;
        const processorName = session.configuration[processorConfig];

        if (!svdPath && !deviceName) {
            return undefined;
        }

        try {
            if (svdPath) {
                const pack = parsePackString(svdPath);

                if (pack) {
                    svdPath = await this.loadFromPack(pack, deviceName, processorName);
                } else if (vscode.env.uiKind === vscode.UIKind.Desktop && !svdPath.startsWith('http')) {
                    // On desktop, ensure full path
                    if (!isAbsolute(svdPath) && wsFolderPath) {
                        svdPath = normalize(join(wsFolderPath.fsPath, svdPath));
                    }
                }
            } else if (deviceName) {
                svdPath = this.registry.getSVDFile(deviceName);
                if (!svdPath) {
                    svdPath = await this.registry.getSVDFileFromCortexDebug(deviceName);
                }
            }
        } catch(e) {
            // eslint-disable-next-line no-console
            console.warn(e);
        }

        return svdPath;
    }

    protected async loadFromPack(pack: Pack, deviceName: string | undefined, processorName: string | undefined): Promise<string | undefined> {
        const getDeviceName = (device: Device) => (device as DeviceVariant).$.Dvariant || device.$.Dname;

        const assetBase = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_ASSET_PATH) || manifest.DEFAULT_ASSET_PATH;
        const pdscPath = pdscFromPack(assetBase, pack);
        const pdscBuffer = await readFromUrl(pdscPath.toString());

        if (!pdscBuffer) {
            throw new Error(`No data loaded from ${pdscPath.toString()}`);
        }

        const decoder = new TextDecoder();
        const pdscString = decoder.decode(pdscBuffer);

        const pdsc = await parseStringPromise(pdscString, {
            explicitCharkey: true
        }) as PDSC;

        // Load devices from pack
        const devices = getDevices(pdsc);
        const deviceMap = new Map();
        for (const device of devices) {
            deviceMap.set(getDeviceName(device), device);
        }

        // Select device
        let packDevice: Device | undefined;

        if (deviceName && deviceMap.has(deviceName)) {
            packDevice = deviceMap.get(deviceName);
        } else if (!deviceName && devices.length == 1) {
            packDevice = devices[0];
        } else {
            // Ask user which device to use
            const items = [...deviceMap.keys()].map(label => ({ label }));
            const selected = await getSelection('Select a device', items, deviceName);
            if (!selected) {
                return;
            }

            if (!deviceMap.has(selected)) {
                throw new Error(`Device not found: ${selected}`);
            }

            packDevice = deviceMap.get(selected);
        }

        if (!packDevice) {
            return;
        }

        // Load processors for device
        const processors = getProcessors(packDevice);

        // Select processor
        if (processorName && processors.includes(processorName)) {
            // Keep existing processor name
        } else if (!processorName && processors.length == 1) {
            processorName = processors[0];
        } else {
            // Ask user which processor to use
            const items = processors.map(label => ({ label }));
            const selected = await getSelection('Select a processor', items, processorName);
            if (!selected) {
                return;
            }

            if (!processors.includes(selected)) {
                throw new Error(`Processor not found: ${selected}`);
            }

            processorName = selected;
        }

        const svdFile = getSvdPath(packDevice, processorName);
        if (!svdFile) {
            throw new Error(`Unable to load device ${getDeviceName(packDevice)}`);
        }

        const svdUri = fileFromPack(assetBase, pack, svdFile);
        return svdUri.toString();
    }
}
