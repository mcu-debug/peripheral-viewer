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

interface QuickPickItem extends vscode.QuickPickItem {
    value?: string;
}

export const getSelection = async (title: string, items: QuickPickItem[], value?: string): Promise<string | undefined> => {
    const disposables: vscode.Disposable[] = [];
    try {
        return await new Promise<string | undefined>(resolve => {
            const input = vscode.window.createQuickPick();
            input.title = title;
            input.items = items;
            if (value) {
                input.value = value;
            }

            for (const item of items) {
                if (item.picked === true) {
                    input.value = item.label;
                    break;
                }
            }

            disposables.push(
                input.onDidChangeSelection(items => {
                    const item = items[0] as QuickPickItem;
                    resolve(item.value || item.label);
                    input.hide();
                }),
                input.onDidHide(() => {
                    resolve(undefined);
                    input.dispose();
                })
            );
            input.show();
        });
    } finally {
        disposables.forEach(d => d.dispose());
    }
};
