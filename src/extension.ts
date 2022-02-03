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
import { readFileSync } from 'fs';
import { parseStringPromise } from 'xml2js';
import { PeripheralTreeProvider } from './peripheral-tree';
import { PeripheralBaseNode } from './nodes/base-node';
import { NumberFormat } from './util';

const EXTENSION_NAME = 'svd-viewer';
const SVD_PATH_CONFIG = 'svdPathConfig';

export function activate(context: vscode.ExtensionContext): void {

    const peripheralProvider = new PeripheralTreeProvider();
    const peripheralTreeView = vscode.window.createTreeView(`${EXTENSION_NAME}.svd`, {
        treeDataProvider: peripheralProvider
    });

    const toggle = (node: PeripheralBaseNode) => {
        peripheralProvider.togglePinPeripheral(node);
        peripheralProvider.refresh();
    };

    const refresh = async (node: PeripheralBaseNode) => {
        const p = node.getPeripheral();
        if (p) {
            await p.updateData();
            peripheralProvider.refresh();
        }
    };

    context.subscriptions.push(
        peripheralTreeView,
        peripheralTreeView.onDidExpandElement((e) => {
            e.element.expanded = true;
            const p = e.element.getPeripheral();
            if (p) {
                p.updateData();
                peripheralProvider.refresh();
            }
        }),
        peripheralTreeView.onDidCollapseElement((e) => {
            e.element.expanded = false;
        }),

        vscode.commands.registerCommand(`${EXTENSION_NAME}.svd.setValue`, async node => {
            try {
                const result = await node.performUpdate();
                if (result) {
                    refresh(node);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Unable to update value: ${error.toString()}`);
            }
        }),
        vscode.commands.registerCommand(`${EXTENSION_NAME}.svd.copyValue`, node => {
            const cv = node.getCopyValue();
            if (cv) {
                vscode.env.clipboard.writeText(cv);
            }
        }),
        vscode.commands.registerCommand(`${EXTENSION_NAME}.svd.refreshValue`, node => refresh(node)),
        vscode.commands.registerCommand(`${EXTENSION_NAME}.svd.pin`, node => toggle(node)),
        vscode.commands.registerCommand(`${EXTENSION_NAME}.svd.unpin`, node => toggle(node)),
        vscode.commands.registerCommand(`${EXTENSION_NAME}.svd.setFormat`, async node => {
            const result = await vscode.window.showQuickPick([
                { label: 'Auto', description: 'Automatically choose format (Inherits from parent)', value: NumberFormat.Auto },
                { label: 'Hex', description: 'Format value in hexidecimal', value: NumberFormat.Hexidecimal },
                { label: 'Decimal', description: 'Format value in decimal', value: NumberFormat.Decimal },
                { label: 'Binary', description: 'Format value in binary', value: NumberFormat.Binary }
            ]);
            if (result === undefined)
                return;

            node.format = result.value;
            peripheralProvider.refresh();
        }),
        vscode.debug.onDidTerminateDebugSession(() => peripheralProvider.debugStopped())
    );

    // Debug Events
    const debugSessionStarted = async (session: vscode.DebugSession) => {
        let svdData: string | undefined;

        const svdConfig = vscode.workspace.getConfiguration(EXTENSION_NAME).get<string>(SVD_PATH_CONFIG);

        if (svdConfig) {
            const svd = session.configuration[svdConfig];

            if (svd) {
                const xml = readFileSync(svd, 'utf8');
                svdData = await parseStringPromise(xml);
            }
        }

        vscode.commands.executeCommand('setContext', `${EXTENSION_NAME}.svd.hasData`, !!svdData);

        if (svdData) {
            peripheralProvider.debugSessionStarted(svdData);
        }
    };

    const debugSessionTerminated = (_session: vscode.DebugSession) => {
        peripheralProvider.debugSessionTerminated();
    };

    const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.DebugAdapterTracker => {
        return {
            onWillStartSession: () => debugSessionStarted(session),
            onWillStopSession: () => debugSessionTerminated(session)
        };
    };

    // Some IDEs don't currently support this faster method
    if (vscode.env.appName === 'Visual Studio Code') {
        vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker: createDebugAdapterTracker
        });
    } else {
        context.subscriptions.push(
            vscode.debug.onDidStartDebugSession(debugSessionStarted),
            vscode.debug.onDidTerminateDebugSession(debugSessionTerminated)
        );
    }
}
