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
import * as manifest from '../manifest';
import { parseStringPromise } from 'xml2js';
import { BaseNode, PeripheralBaseNode } from './nodes/basenode';
import { PeripheralNode } from './nodes/peripheralnode';
import { MessageNode } from './nodes/messagenode';
import { NodeSetting } from '../common';
import { SVDParser } from '../svd-parser';
import { AddrRange } from '../addrranges';
import { DebugTracker } from '../debug-tracker';
import { SvdResolver } from '../svd-resolver';
import { readFromUrl } from '../utils';
import { uriExists } from '../vscode-utils';

const STATE_FILENAME = '.svd-viewer.state.json';

const pathToUri = (path: string): vscode.Uri => {
    try {
        return vscode.Uri.file(path);
    } catch (e) {
        return vscode.Uri.parse(path);
    }
};

export class PeripheralTreeForSession extends PeripheralBaseNode {
    public myTreeItem: vscode.TreeItem;
    private peripherials: PeripheralNode[] = [];
    private loaded = false;
    private errMessage = 'No SVD file loaded';

    constructor(
        public session: vscode.DebugSession,
        public state: vscode.TreeItemCollapsibleState,
        private wsFolderPath: vscode.Uri | undefined,
        private fireCb: () => void) {
        super();
        this.myTreeItem = new vscode.TreeItem(this.session.name, this.state);
    }

    private getSvdStateUri(): vscode.Uri | undefined {
        if (!this.wsFolderPath) {
            return undefined;
        }

        return vscode.Uri.joinPath(this.wsFolderPath, '.vscode', STATE_FILENAME);
    }

    private async loadSvdState(): Promise<NodeSetting[]> {
        const stateUri = this.getSvdStateUri();
        if (stateUri) {
            const exists = await uriExists(stateUri);
            if (exists) {
                await vscode.workspace.fs.stat(stateUri);
                const data = await vscode.workspace.fs.readFile(stateUri);
                const decoder = new TextDecoder();
                const text = decoder.decode(data);
                return JSON.parse(text);
            }
        }

        return [];
    }

    private async saveSvdState(state: NodeSetting[]): Promise<void> {
        const stateUri = this.getSvdStateUri();
        if (stateUri) {
            try {
                const text = JSON.stringify(state);
                const encoder = new TextEncoder();
                const data = encoder.encode(text);
                await vscode.workspace.fs.writeFile(stateUri, data);
            } catch (e) {
                vscode.window.showWarningMessage(`Unable to save peripheral preferences ${e}`);
            }
        }
    }

    public saveState(): NodeSetting[] {
        const state: NodeSetting[] = [];
        this.peripherials.forEach((p) => {
            state.push(... p.saveState());
        });

        return state;
    }

    private async createPeripherals(svdPath: string, gapThreshold: number): Promise<void> {
        let svdData: string | undefined;

        try {
            let contents: ArrayBuffer | undefined;

            if (svdPath.startsWith('http')) {
                contents = await readFromUrl(svdPath);
            } else {
                const uri = pathToUri(svdPath);
                contents = await vscode.workspace.fs.readFile(uri);
            }

            if (contents) {
                const decoder = new TextDecoder();
                const xml = decoder.decode(contents);
                svdData = await parseStringPromise(xml);
            }
        } catch(e) {
            // eslint-disable-next-line no-console
            console.warn(e);
        }

        if (!svdData) {
            return;
        }

        this.errMessage = `Loading ${svdPath}`;

        try {
            this.peripherials = await SVDParser.parseSVD(this.session, JSON.parse(svdData), gapThreshold);
            this.loaded = true;
        } catch(e) {
            this.peripherials = [];
            this.loaded = false;
            throw e;
        }

        this.errMessage = '';
    }

    public performUpdate(): Thenable<boolean> {
        throw new Error('Method not implemented.');
    }

    public updateData(): Thenable<boolean> {
        if (this.loaded) {
            const promises = this.peripherials.map((p) => p.updateData());
            Promise.all(promises).then((_) => { this.fireCb(); }, (_) => { this.fireCb(); });
        }
        return Promise.resolve(true);
    }

    public getPeripheral(): PeripheralBaseNode {
        throw new Error('Method not implemented.');
    }

    public collectRanges(_ary: AddrRange[]): void {
        throw new Error('Method not implemented.');
    }

    public findByPath(_path: string[]): PeripheralBaseNode {
        throw new Error('Method not implemented.');     // Shouldn't be called
    }

    private findNodeByPath(path: string): PeripheralBaseNode | undefined {
        const pathParts = path.split('.');
        const peripheral = this.peripherials.find((p) => p.name === pathParts[0]);
        if (!peripheral) { return undefined; }

        return peripheral.findByPath(pathParts.slice(1));
    }

    public refresh(): void {
        this.fireCb();
    }

    public getTreeItem(element?: BaseNode): vscode.TreeItem | Promise<vscode.TreeItem> {
        return element ? element.getTreeItem() : this.myTreeItem;
    }

    public getChildren(element?: PeripheralBaseNode): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]> {
        if (this.loaded) {
            return element ? element.getChildren() : this.peripherials;
        } else if (!this.loaded) {
            return [new MessageNode(this.errMessage)];
        } else {
            return this.peripherials;
        }
    }

    public getCopyValue(): string | undefined {
        return undefined;
    }

    public async sessionStarted(svdPath: string, thresh: number): Promise<void> {        // Never rejects
        if (((typeof thresh) === 'number') && (thresh < 0)) {
            thresh = -1;     // Never merge register reads even if adjacent
        } else {
            // Set the threshold between 0 and 32, with a default of 16 and a mukltiple of 8
            thresh = ((((typeof thresh) === 'number') ? Math.max(0, Math.min(thresh, 32)) : 16) + 7) & ~0x7;
        }

        this.peripherials = [];
        this.fireCb();

        try {
            await this.createPeripherals(svdPath, thresh);

            const settings = await this.loadSvdState();
            settings.forEach((s: NodeSetting) => {
                const node = this.findNodeByPath(s.node);
                if (node) {
                    node.expanded = s.expanded || false;
                    node.pinned = s.pinned || false;
                    if (s.format) {
                        node.format = s.format;
                    }
                }
            });
            this.peripherials.sort(PeripheralNode.compare);
            this.fireCb();
        } catch(e) {
            this.errMessage = `Unable to parse SVD file ${svdPath}: ${(e as Error).message}`;
            vscode.window.showErrorMessage(this.errMessage);
            if (vscode.debug.activeDebugConsole) {
                vscode.debug.activeDebugConsole.appendLine(this.errMessage);
            }
            this.fireCb();
        }
    }

    public sessionTerminated(): void {
        const state = this.saveState();
        this.saveSvdState(state);
    }

    public togglePinPeripheral(node: PeripheralBaseNode): void {
        node.pinned = !node.pinned;
        this.peripherials.sort(PeripheralNode.compare);
    }
}

export class PeripheralTreeProvider implements vscode.TreeDataProvider<PeripheralBaseNode> {
    // tslint:disable-next-line:variable-name
    public _onDidChangeTreeData: vscode.EventEmitter<PeripheralBaseNode | undefined> = new vscode.EventEmitter<PeripheralBaseNode | undefined>();
    public readonly onDidChangeTreeData: vscode.Event<PeripheralBaseNode | undefined> = this._onDidChangeTreeData.event;
    protected sessionPeripheralsMap = new Map <string, PeripheralTreeForSession>();
    protected oldState = new Map <string, vscode.TreeItemCollapsibleState>();

    constructor(tracker: DebugTracker, protected resolver: SvdResolver) {
        tracker.onWillStartSession(session => this.debugSessionStarted(session));
        tracker.onDidStopSession(session => this.debugSessionTerminated(session));
    }

    public async activate(context: vscode.ExtensionContext): Promise<void> {
        const view = vscode.window.createTreeView(`${manifest.PACKAGE_NAME}.svd`, { treeDataProvider: this });
        context.subscriptions.push(
            view,
            view.onDidExpandElement((e) => {
                e.element.expanded = true;
                const p = e.element.getPeripheral();
                if (p) {
                    p.updateData();
                    this.refresh();
                }
            }),
            view.onDidCollapseElement((e) => {
                e.element.expanded = false;
            })
        );
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public getTreeItem(element: PeripheralBaseNode): vscode.TreeItem | Promise<vscode.TreeItem> {
        return element?.getTreeItem();
    }

    public getChildren(element?: PeripheralBaseNode): vscode.ProviderResult<PeripheralBaseNode[]> {
        const values = Array.from(this.sessionPeripheralsMap.values());
        if (element) {
            return element.getChildren();
        } else if (values.length === 0) {
            return [new MessageNode('SVD: No active debug sessions or no SVD files specified')];
        } else if (values.length === 1) {
            return values[0].getChildren();     // Don't do root nodes at top-level if there is only one root
        } else {
            return values;
        }
    }

    public async debugSessionStarted(session: vscode.DebugSession): Promise<void> {
        const svdConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_SVD_PATH) || manifest.DEFAULT_SVD_PATH;
        const svd = session.configuration[svdConfig];

        const deviceConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_DEVICE) || manifest.DEFAULT_DEVICE;
        const device = session.configuration[deviceConfig];

        const wsFolderPath = session.workspaceFolder ? session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;
        const svdPath = await this.resolver.resolve(svd, device, wsFolderPath);

        if (!svdPath) {
            return;
        }

        if (this.sessionPeripheralsMap.get(session.id)) {
            this._onDidChangeTreeData.fire(undefined);
            vscode.window.showErrorMessage(`Internal Error: Session ${session.name} id=${session.id} already in the tree view?`);
            return;
        }

        let state = this.oldState.get(session.name);
        if (state === undefined) {
            state = this.sessionPeripheralsMap.size === 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
        }
        const regs = new PeripheralTreeForSession(session, state, wsFolderPath, () => {
            this._onDidChangeTreeData.fire(undefined);
        });

        this.sessionPeripheralsMap.set(session.id, regs);
        let thresh = session.configuration[manifest.CONFIG_ADDRGAP];

        if (!thresh) {
            thresh = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.CONFIG_ADDRGAP) || manifest.DEFAULT_ADDRGAP;
        }

        try {
            await regs.sessionStarted(svdPath, thresh);     // Should never reject
        } catch (e) {
            vscode.window.showErrorMessage(`Internal Error: Unexpected rejection of promise ${e}`);
        } finally {
            this._onDidChangeTreeData.fire(undefined);
        }

        vscode.commands.executeCommand('setContext', `${manifest.PACKAGE_NAME}.svd.hasData`, this.sessionPeripheralsMap.size > 0);
    }

    public debugSessionTerminated(session: vscode.DebugSession): void {
        const regs = this.sessionPeripheralsMap.get(session.id);

        if (regs && regs.myTreeItem.collapsibleState) {
            this.oldState.set(session.name, regs.myTreeItem.collapsibleState);
            this.sessionPeripheralsMap.delete(session.id);
            regs.sessionTerminated();
            this._onDidChangeTreeData.fire(undefined);
        }

        vscode.commands.executeCommand('setContext', `${manifest.PACKAGE_NAME}.svd.hasData`, this.sessionPeripheralsMap.size > 0);
    }

    public togglePinPeripheral(node: PeripheralBaseNode): void {
        const session = vscode.debug.activeDebugSession;
        if (session) {
            const regs = this.sessionPeripheralsMap.get(session.id);
            if (regs) {
                regs.togglePinPeripheral(node);
                this._onDidChangeTreeData.fire(undefined);
            }
        }
    }
}
