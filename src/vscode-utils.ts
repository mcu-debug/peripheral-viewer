/**
 * Copyright (C) 2023 Arm Limited
 */

import * as vscode from 'vscode';

export const uriExists = async (uri: vscode.Uri): Promise<boolean> => {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
};

let enableLogOutput = false;
export let logOutputChannel: vscode.OutputChannel | undefined;
export function setLogOutput(val: boolean) {
    enableLogOutput = val;
}
export function logToOutputWindow(msg: string) {
    if (enableLogOutput) {
        if (!logOutputChannel) {
            logOutputChannel = vscode.window.createOutputChannel('Peripheral Viewer');
        }
        if (logOutputChannel) {
            logOutputChannel.appendLine(msg);
        }
    }
}
