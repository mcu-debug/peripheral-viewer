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

import { commands, debug, window, env, DebugAdapterTracker, DebugSession, DebugSessionCustomEvent, TreeView, ExtensionContext } from 'vscode';
import { PeripheralTreeProvider } from './peripheral-tree';
import { PeripheralBaseNode } from './nodes/base-node';
import { NumberFormat } from './util';

const EXTENSION_NAME = 'svd-viewer';

class SvdExtension {
    private peripheralProvider: PeripheralTreeProvider;
    private peripheralTreeView: TreeView<PeripheralBaseNode>;

    constructor(context: ExtensionContext) {
        this.peripheralProvider = new PeripheralTreeProvider();

        this.peripheralTreeView = window.createTreeView(`${EXTENSION_NAME}.svd`, {
            treeDataProvider: this.peripheralProvider
        });

        context.subscriptions.push(
            commands.registerCommand(`${EXTENSION_NAME}.svd.setValue`, this.peripheralsUpdateNode.bind(this)),
            commands.registerCommand(`${EXTENSION_NAME}.svd.copyValue`, this.peripheralsCopyValue.bind(this)),
            commands.registerCommand(`${EXTENSION_NAME}.svd.refreshValue`, this.peripheralsForceRefresh.bind(this)),
            commands.registerCommand(`${EXTENSION_NAME}.svd.pin`, this.peripheralsTogglePin.bind(this)),
            commands.registerCommand(`${EXTENSION_NAME}.svd.unpin`, this.peripheralsTogglePin.bind(this)),
            commands.registerCommand(`${EXTENSION_NAME}.svd.setFormat`, this.peripheralsSetFormat.bind(this)),
            debug.onDidReceiveDebugSessionCustomEvent(this.receivedCustomEvent.bind(this)),

            this.peripheralTreeView,
            this.peripheralTreeView.onDidExpandElement((e) => {
                e.element.expanded = true;
                const p = e.element.getPeripheral();
                if (p) {
                    p.updateData();
                    this.peripheralProvider.refresh();
                }
            }),
            this.peripheralTreeView.onDidCollapseElement((e) => {
                e.element.expanded = false;
            })
        );

        // Theia doesn't currently support this faster method
        if (env.appName === 'Visual Studio Code') {
            debug.registerDebugAdapterTrackerFactory(`${EXTENSION_NAME}-debug`, {
                createDebugAdapterTracker: this.createDebugAdapterTracker.bind(this)
            });
        } else {
            context.subscriptions.push(
                debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)),
                debug.onDidTerminateDebugSession(this.debugSessionTerminated.bind(this))
            );
        }
    }

    private createDebugAdapterTracker(session: DebugSession): DebugAdapterTracker {
        return {
            onWillStartSession: () => this.debugSessionStarted.call(this, session),
            onWillStopSession: () => this.debugSessionTerminated.call(this, session)
        };
    }

    private async peripheralsUpdateNode(node: PeripheralBaseNode): Promise<void> {
        try {
            const result = await node.performUpdate();
            if (result) {
                this.peripheralsForceRefresh(node);
            }
        } catch (error) {
            window.showErrorMessage(`Unable to update value: ${error.toString()}`);
        }
    }

    private peripheralsCopyValue(node: PeripheralBaseNode): void {
        const cv = node.getCopyValue();
        if (cv) {
            env.clipboard.writeText(cv);
        }
    }

    private async peripheralsSetFormat(node: PeripheralBaseNode): Promise<void> {
        const result = await window.showQuickPick([
            { label: 'Auto', description: 'Automatically choose format (Inherits from parent)', value: NumberFormat.Auto },
            { label: 'Hex', description: 'Format value in hexidecimal', value: NumberFormat.Hexidecimal },
            { label: 'Decimal', description: 'Format value in decimal', value: NumberFormat.Decimal },
            { label: 'Binary', description: 'Format value in binary', value: NumberFormat.Binary }
        ]);
        if (result === undefined)
            return;

        node.format = result.value;
        this.peripheralProvider.refresh();
    }

    private async peripheralsForceRefresh(node: PeripheralBaseNode): Promise<void> {
        const p = node.getPeripheral();
        if (p) {
            await p.updateData();
            this.peripheralProvider.refresh();
        }
    }

    private async peripheralsTogglePin(node: PeripheralBaseNode): Promise<void> {
        this.peripheralProvider.togglePinPeripheral(node);
        this.peripheralProvider.refresh();
    }

    private receivedCustomEvent(e: DebugSessionCustomEvent) {
        if (e.event === 'custom-stop') {
            this.peripheralProvider.debugStopped();
        }
    }

    // Debug Events
    private async debugSessionStarted(session: DebugSession) {
        const svdData = await session.customRequest('get-svd');
        commands.executeCommand('setContext', `${EXTENSION_NAME}.svd.hasData`, !!svdData);
        this.peripheralProvider.debugSessionStarted(svdData || undefined);
    }

    private debugSessionTerminated(_session: DebugSession) {
        this.peripheralProvider.debugSessionTerminated();
    }
}

export function activate(context: ExtensionContext): void {
    new SvdExtension(context);
}
