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
import { BaseNode, PeripheralBaseNode } from './nodes/basenode';
import { PeripheralNode } from './nodes/peripheralnode';
import { MessageNode } from './nodes/messagenode';
import { NodeSetting } from '../common';
import { AddrRange } from '../addrranges';
import { DebugTrackerWrapper } from '../debug-tracker-wrapper';
import { PeripheralRegisterNode } from './nodes/peripheralregisternode';
import { PeripheralsProvider } from '../peripherals-provider';

const traceExec = false;

interface CachedSVDFile {
    cacheKey: vscode.Uri | string;
    mtime: number;
    peripherials: PeripheralNode[]
}

export class PeripheralTreeForSession extends PeripheralBaseNode {
    private static svdCache: {[path:string]: CachedSVDFile} = {};
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

    private static getStatePropName(session: vscode.DebugSession): string {
        const propName = (session.workspaceFolder?.name || '*unknown*') + '-SVDstate';
        return propName;
    }

    private async loadSvdState(context: vscode.ExtensionContext): Promise<NodeSetting[]> {
        const saveLayout = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<boolean>(manifest.CONFIG_SAVE_LAYOUT, true);
        if (!saveLayout) {
            return [];
        }

        const propName = PeripheralTreeForSession.getStatePropName(this.session);
        const state = context.workspaceState.get(propName) as NodeSetting[] || [];
        return state;
    }

    private async saveSvdState(state: NodeSetting[], context: vscode.ExtensionContext): Promise<void> {
        const saveLayout = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<boolean>(manifest.CONFIG_SAVE_LAYOUT, true);
        if (saveLayout && this.session) {
            const propName = PeripheralTreeForSession.getStatePropName(this.session);
            context.workspaceState.update(propName, state);
        }
    }

    public saveState(): NodeSetting[] {
        const state: NodeSetting[] = [];
        this.peripherials.forEach((p) => {
            state.push(... p.saveState());
        });

        return state;
    }

    private static async addToCache(cacheKey: string | vscode.Uri | undefined, peripherals: PeripheralNode[]) {
        if(!cacheKey) {
            return;
        }
        try {
            if (typeof cacheKey === 'string') {
                const tmp: CachedSVDFile = {
                    cacheKey: cacheKey,
                    mtime: 0,
                    peripherials: peripherals
                };
                PeripheralTreeForSession.svdCache[cacheKey.toString()] = tmp;
            } else {
                const stat = await vscode.workspace.fs.stat(cacheKey);
                if (stat && stat.mtime) {
                    const tmp: CachedSVDFile = {
                        cacheKey: cacheKey,
                        mtime: stat.mtime,
                        peripherials: peripherals
                    };
                    PeripheralTreeForSession.svdCache[cacheKey.toString()] = tmp;
                }
            }
        } catch {
            delete PeripheralTreeForSession.svdCache[cacheKey.toString()];
            return;
        }
    }

    private static async getFromCache(cacheKey: string | vscode.Uri | undefined): Promise<PeripheralNode[] | undefined> {
        if(!cacheKey) {
            return undefined;
        }
        try {
            const cached = PeripheralTreeForSession.svdCache[cacheKey.toString()];
            if (cached) {
                return cached.peripherials;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    private async loadPeripherals(provider: PeripheralsProvider): Promise<void> {
        const cacheKey = await provider.cacheKey();
        const cached = await PeripheralTreeForSession.getFromCache(cacheKey);
        if (cached) {
            this.peripherials = cached;
            this.loaded = true;
            this.errMessage = '';
            await this.setSession(this.session);
            return;
        }
        const peripherals = await provider.getPeripherals();
        if(peripherals?.length) {
            this.peripherials = peripherals;
            this.loaded = true;
            await this.setSession(this.session);
            await PeripheralTreeForSession.addToCache(cacheKey, peripherals);
            return;
        } else {
            this.peripherials = [];
            this.loaded = false;
        }
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

    public async sessionStarted(context: vscode.ExtensionContext, provider: PeripheralsProvider): Promise<void> {        // Never rejects
        this.peripherials = [];
        this.fireCb();

        try {
            await this.loadPeripherals(provider);

            const settings = await this.loadSvdState(context);
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
            // this.fireCb();
        } catch(e) {
            this.errMessage = `Error occured on SVD viewer loading: ${(e as Error).message}`;
            vscode.window.showErrorMessage(this.errMessage);
            if (vscode.debug.activeDebugConsole) {
                vscode.debug.activeDebugConsole.appendLine(this.errMessage);
            }
            this.fireCb();
        }
    }

    public sessionTerminated(context: vscode.ExtensionContext): void {
        const state = this.saveState();
        this.saveSvdState(state, context);
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

    constructor(tracker: DebugTrackerWrapper, protected context: vscode.ExtensionContext) {
        tracker.onWillStartSession(session => this.debugSessionStarted(session));
        tracker.onWillStopSession(session => this.debugSessionTerminated(session));
        tracker.onDidStopDebug(session => this.debugStopped(session));
        tracker.onDidContinueDebug(session => this.debugContinued(session));
    }

    public async activate(): Promise<void> {
        const opts: vscode.TreeViewOptions<PeripheralBaseNode> = {
            treeDataProvider: this,
            showCollapseAll: true
        };
        const view = vscode.window.createTreeView(`${manifest.PACKAGE_NAME}.svd`, opts);
        this.context.subscriptions.push(
            view,
            view.onDidExpandElement((e) => {
                e.element.expanded = true;
                const isReg = e.element instanceof PeripheralRegisterNode;
                if (!isReg) {
                    // If we are at a register level, parent already expanded, no update/refresh needed
                    const p = e.element.getPeripheral();
                    if (p) {
                        p.updateData();
                        this.refresh();
                    }
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

    public async updateData(): Promise<void> {
        const trees = this.sessionPeripheralsMap.values();
        for (const tree of trees) {
            await tree.updateData();
        }

        this.refresh();
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
        if (traceExec && vscode.debug.activeDebugConsole) {
            vscode.debug.activeDebugConsole.appendLine('peripheral-viewer: ' + session.id + ': Session Started');
        }

        const wsFolderPath = session.workspaceFolder ? session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;

        const provider = new PeripheralsProvider(session, this.context);

        const cacheKey = await provider.cacheKey();

        if (!cacheKey) {
            return;
        }

        // We enable our panel once and just stay there. Users can disable if they want in multiple ways
        const cxtName = `${manifest.PACKAGE_NAME}.hadData`;
        vscode.commands.executeCommand('setContext', cxtName, true);

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
            await regs.sessionStarted(this.context, provider);     // Should never reject
        } catch (e) {
            vscode.window.showErrorMessage(`Internal Error: Unexpected rejection of promise ${e}`);
        } finally {
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    public debugSessionTerminated(session: vscode.DebugSession): void {
        if (!this.sessionPeripheralsMap.get(session.id)) {
            return;
        }
        if (traceExec && vscode.debug.activeDebugConsole) {
            vscode.debug.activeDebugConsole.appendLine('peripheral-viewer: ' + session.id + ': Session Terminated');
        }
        if (this.stopedTimer) {
            clearTimeout(this.stopedTimer);
            this.stopedTimer = undefined;
        }
        const regs = this.sessionPeripheralsMap.get(session.id);

        if (regs && regs.myTreeItem.collapsibleState) {
            this.oldState.set(session.name, regs.myTreeItem.collapsibleState);
            this.sessionPeripheralsMap.delete(session.id);
            regs.sessionTerminated(this.context);
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    private stopedTimer: NodeJS.Timeout | undefined;
    public debugStopped(session: vscode.DebugSession): void {
        if (!this.sessionPeripheralsMap.get(session.id)) {
            return;
        }
        if (traceExec && vscode.debug.activeDebugConsole) {
            vscode.debug.activeDebugConsole.appendLine('peripheral-viewer: ' + session.id + ': Session Stopped');
        }

        // We are stopped for many reasons very briefly where we cannot even execute any queries
        // reliably and get errors. Programs stop briefly to set breakpoints, during startup/reset/etc.
        // Also give VSCode some time to finish it's updates (Variables, Stacktraces, etc.)
        this.stopedTimer = setTimeout(() => {
            this.stopedTimer = undefined;
            const regs = this.sessionPeripheralsMap.get(session.id);
            if (regs) {     // We are called even before the session has started, as part of reset
                regs.updateData();
            }
        }, 100);
    }

    public debugContinued(session: vscode.DebugSession): void {
        if (!this.sessionPeripheralsMap.get(session.id)) {
            return;
        }
        if (traceExec && vscode.debug.activeDebugConsole) {
            vscode.debug.activeDebugConsole.appendLine('peripheral-viewer: ' + session.id + ': Session Continued');
        }
        if (this.stopedTimer) {
            clearTimeout(this.stopedTimer);
            this.stopedTimer = undefined;
        }
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
