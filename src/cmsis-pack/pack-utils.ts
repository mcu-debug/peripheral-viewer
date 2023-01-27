/**
 * Copyright (C) 2023 Arm Limited
 */

import * as vscode from 'vscode';

const MAIN_DELIMITER = '::';
const VERSION_DELIMITER = '@';

export interface Pack {
    vendor: string;
    pack: string;
    version?: string;
}

export const parsePackString = (packString: string): Pack | undefined => {
    let parts = packString.split(MAIN_DELIMITER);

    if (parts.length < 2) {
        return undefined;
    }

    const vendor = parts[0];
    let pack = parts[1];

    parts = pack.split(VERSION_DELIMITER);
    let version: string | undefined;

    if (parts.length > 1) {
        pack = parts[0];
        version = parts[1];
    }

    return {
        vendor,
        pack,
        version
    };
};

export const pdscFromPack = (basePath: string, pack: Pack): vscode.Uri => {
    const pdscFile = `${pack.vendor}.${pack.pack}.pdsc`;
    return fileFromPack(basePath, pack, pdscFile);
};

export const fileFromPack = (basePath: string, pack: Pack, file: string): vscode.Uri => {
    if (!pack.version) {
        throw new Error('CMSIS pack version is required');
    }

    const baseUri = vscode.Uri.parse(basePath);
    return vscode.Uri.joinPath(baseUri, pack.vendor, pack.pack, pack.version, file);
};
