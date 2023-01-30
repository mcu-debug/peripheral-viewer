/**
 * Copyright (C) 2023 Arm Limited
 */

import * as vscode from 'vscode';
import * as manifest from './manifest';
import { isAbsolute, join, normalize } from 'path';
import { parseStringPromise } from 'xml2js';
import { SvdRegistry } from './svd-registry';
import { parsePackString, pdscFromPack, fileFromPack } from './cmsis-pack/pack-utils';
import { PDSC, Device, DeviceVariant, getDevices, getSvdPath } from './cmsis-pack/pdsc';
import { readFromUrl } from './utils';
import { getSelection } from './vscode-utils';

export class SvdResolver {
    public constructor(protected registry: SvdRegistry) {
    }

    public async resolve(svdPath: string | undefined, device: string | undefined, wsFolderPath?: vscode.Uri): Promise<string | undefined> {
        if (!svdPath && !device) {
            return undefined;
        }

        try {
            if (svdPath) {
                const pack = parsePackString(svdPath);

                if (pack) {
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
                    for (const dev of devices) {
                        deviceMap.set(getDeviceName(dev), dev);
                    }

                    let packDevice: Device | undefined;

                    if (device && deviceMap.has(device)) {
                        packDevice = deviceMap.get(device);
                    } else if (!device && devices.length == 1) {
                        packDevice = devices[0];
                    } else {
                        // Ask user which device to use
                        const items = [...deviceMap.keys()];
                        const selected = await getSelection('Select a device', items, device);
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

                    const svdFile = getSvdPath(packDevice);
                    if (!svdFile) {
                        throw new Error(`Unable to load device ${getDeviceName(packDevice)}`);
                    }

                    const svdUri = fileFromPack(assetBase, pack, svdFile);
                    svdPath = svdUri.toString();
                } else if (vscode.env.uiKind === vscode.UIKind.Desktop && !svdPath.startsWith('http')) {
                    // On desktop, ensure full path
                    if (!isAbsolute(svdPath) && wsFolderPath) {
                        svdPath = normalize(join(wsFolderPath.fsPath, svdPath));
                    }
                }
            } else if (device) {
                svdPath = this.registry.getSVDFile(device);
                if (!svdPath) {
                    svdPath = await this.registry.getSVDFileFromCortexDebug(device);
                }
            }
        } catch(e) {
            // eslint-disable-next-line no-console
            console.warn(e);
        }

        return svdPath;
    }
}
