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
import * as manifest from '../src/manifest';
import { PeripheralBaseNode } from './nodes/base-node';
import { PeripheralTree } from './peripheral-tree';
import { NumberFormat } from './util';

export class SvdCommands {
    public constructor(protected tree: PeripheralTree) {
    }

    public async activate(context: vscode.ExtensionContext): Promise<void> {
        context.subscriptions.push(
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.setValue`, async node => {
                try {
                    const result = await node.performUpdate();
                    if (result) {
                        this.refresh(node);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Unable to update value: ${error.toString()}`);
                }
            }),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.copyValue`, node => {
                const cv = node.getCopyValue();
                if (cv) {
                    vscode.env.clipboard.writeText(cv);
                }
            }),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.refreshValue`, node => this.refresh(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.pin`, node => this.toggle(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.unpin`, node => this.toggle(node)),
            vscode.commands.registerCommand(`${manifest.PACKAGE_NAME}.svd.setFormat`, async node => {
                const result = await vscode.window.showQuickPick([
                    { label: 'Auto', description: 'Automatically choose format (Inherits from parent)', value: NumberFormat.Auto },
                    { label: 'Hex', description: 'Format value in hexidecimal', value: NumberFormat.Hexidecimal },
                    { label: 'Decimal', description: 'Format value in decimal', value: NumberFormat.Decimal },
                    { label: 'Binary', description: 'Format value in binary', value: NumberFormat.Binary }
                ]);
                if (result === undefined)
                    return;

                node.format = result.value;
                this.tree.refresh();
            }),
        );
    }

    protected async refresh(node: PeripheralBaseNode): Promise<void> {
        const p = node.getPeripheral();
        if (p) {
            await p.updateData();
            this.tree.refresh();
        }
    }

    protected toggle(node: PeripheralBaseNode): void {
        this.tree.togglePinPeripheral(node);
        this.tree.refresh();
    }
}
