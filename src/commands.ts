/*
 * Copyright 2017-2019 Marcel Ball
 * https://github.com/Marus/cortex-debug
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import * as vscode from 'vscode';
import * as manifest from './manifest';
import { PeripheralBaseNode } from './views/nodes/basenode';
import { PeripheralTreeProvider } from './views/peripheral';
import { NumberFormat } from './common';

export class Commands {
    public constructor(protected peripheralProvider: PeripheralTreeProvider) {
    }

    public async activate(context: vscode.ExtensionContext): Promise<void> {
        context.subscriptions.push(
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.updateNode`, node => this.peripheralsUpdateNode(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.copyValue`, node => this.peripheralsCopyValue(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.setFormat`, node => this.peripheralsSetFormat(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.forceRefresh`, node => this.peripheralsForceRefresh(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.pin`, node => this.peripheralsTogglePin(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.unpin`, node => this.peripheralsTogglePin(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.refreshAll`, () => this.peripheralsForceRefresh()),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.collapseAll`, () => this.peripheralsCollapseAll())
        );
    }

    private async peripheralsUpdateNode(node: PeripheralBaseNode): Promise<void> {
        try {
            const result = await node.performUpdate();
            if (result) {
                this.peripheralsForceRefresh(node);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Unable to update value: ${(error as Error).message}`);
        }
    }

    private peripheralsCopyValue(node: PeripheralBaseNode): void {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv);
        }
    }

    private async peripheralsSetFormat(node: PeripheralBaseNode): Promise<void> {
        const result = await vscode.window.showQuickPick([
            { label: 'Auto', description: 'Automatically choose format (Inherits from parent)', value: NumberFormat.Auto },
            { label: 'Hex', description: 'Format value in hexadecimal', value: NumberFormat.Hexadecimal },
            { label: 'Decimal', description: 'Format value in decimal', value: NumberFormat.Decimal },
            { label: 'Binary', description: 'Format value in binary', value: NumberFormat.Binary }
        ]);
        if (result === undefined) {
            return;
        }

        node.format = result.value;
        this.peripheralProvider.refresh();
    }

    private async peripheralsForceRefresh(node?: PeripheralBaseNode): Promise<void> {
        if (node) {
            const p = node.getPeripheral();
            if (p) {
                await p.updateData();
            }
        } else {
            this.peripheralProvider.updateData();
        }
    }

    private peripheralsCollapseAll(): void {
        this.peripheralProvider.collapseAll();
    }

    private peripheralsTogglePin(node: PeripheralBaseNode): void {
        this.peripheralProvider.togglePinPeripheral(node);
        this.peripheralProvider.refresh();
    }
}
