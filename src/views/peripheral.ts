import * as vscode from 'vscode';
import * as path from 'path';
import * as manifest from '../manifest';
import { parseStringPromise } from 'xml2js';
import { NodeSetting } from '../common';
import { BaseNode, PeripheralBaseNode } from './nodes/basenode';
import { PeripheralNode } from './nodes/peripheralnode';
import { SVDParser } from '../svd';
import { MessageNode } from './nodes/messagenode';
import { AddrRange } from '../addrranges';
import { DebugTracker } from '../debug-tracker';
import { SvdRegistry } from '../svd-registry';

const STATE_FILENAME = '.svd-viewer.state.json';
const SVD_THRESH_ARG = 'svdAddrGapThreshold';

const pathToUri = (path: string): vscode.Uri => {
    try {
        return vscode.Uri.file(path);
    } catch (e) {
        return vscode.Uri.parse(path);
    }
};

const readFromUrl = async (url: string): Promise<Response> => {
    // Download using fetch
    const response = await fetch(url);
    if (!response.ok) {
        const body = await response.text();
        const msg = `Request to ${url} failed. Status="${response.status}". Body="${body}".`;
        throw new Error(msg);
    }

    return response;
};

export class PeripheralTreeForSession extends PeripheralBaseNode {
    public myTreeItem: vscode.TreeItem;
    private peripherials: PeripheralNode[] = [];
    private loaded: boolean = false;
    private errMessage: string = 'No SVD file loaded';
    private wsFolderPath: vscode.Uri | undefined;

    constructor(
        public session: vscode.DebugSession,
        public state: vscode.TreeItemCollapsibleState,
        private fireCb: () => void) {
        super();
        // Remember the path as it may not be available when session ends
        this.wsFolderPath = this.session.workspaceFolder ? this.session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;
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
            try {
                await vscode.workspace.fs.stat(stateUri);
                const data = await vscode.workspace.fs.readFile(stateUri);
                const decoder = new TextDecoder();
                const text = decoder.decode(data);
                return JSON.parse(text);
            } catch {
                // File may not exist
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
    
    private async loadSVD(svd: string, gapThreshold: number = 16): Promise<void> {
        let svdData: string | undefined;

        try {
            let contents: ArrayBuffer | undefined;

            if (svd.startsWith('http')) {
                const response = await readFromUrl(svd);
                contents = await response.arrayBuffer();
            } else {
                if (vscode.env.uiKind === vscode.UIKind.Desktop) {
                    // On desktop, ensure full path
                    if (!path.isAbsolute(svd) && this.wsFolderPath) {
                        svd = path.normalize(path.join(this.wsFolderPath.fsPath, svd));
                    }
                }

                const uri = pathToUri(svd);
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

        this.errMessage = `Loading ${svd}`;

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

    public performUpdate(): Thenable<any> {
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

    public collectRanges(ary: AddrRange[]): void {
        throw new Error('Method not implemented.');
    }

    public findByPath(path: string[]): PeripheralBaseNode {
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

    public async sessionStarted(svd: string, thresh: number): Promise<void> {        // Never rejects
        if (((typeof thresh) === 'number') && (thresh < 0)) {
            thresh = -1;     // Never merge register reads even if adjacent
        } else {
            // Set the threshold between 0 and 32, with a default of 16 and a mukltiple of 8
            thresh = ((((typeof thresh) === 'number') ? Math.max(0, Math.min(thresh, 32)) : 16) + 7) & ~0x7;
        }

        this.peripherials = [];
        this.fireCb();
        
        try {
            await this.loadSVD(svd, thresh);

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
            this.errMessage = `Unable to parse SVD file ${svd}: ${(e as Error).message}`;
            vscode.window.showErrorMessage(this.errMessage);
            if (vscode.debug.activeDebugConsole) {
                vscode.debug.activeDebugConsole.appendLine(this.errMessage);
            }
            this.fireCb();
        }
    }

    public sessionTerminated() {
        const state = this.saveState();
        this.saveSvdState(state);
    }

    public togglePinPeripheral(node: PeripheralBaseNode) {
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

    constructor(tracker: DebugTracker, protected registry: SvdRegistry) {
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
        let svd = session.configuration[svdConfig];

        if (!svd) {
            // Try loading from device support pack
            const deviceConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_DEVICE) || manifest.DEFAULT_DEVICE;
            const device = session.configuration[deviceConfig];

            if (device) {
                svd = this.registry.getSVDFile(device);
                if (!svd) {
                    svd = await this.registry.getSVDFileFromCortexDebug(device);
                }
            }
        }

        if (!svd) {
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
        const regs = new PeripheralTreeForSession(session, state, () => {
            this._onDidChangeTreeData.fire(undefined);
        });

        this.sessionPeripheralsMap.set(session.id, regs);
        const thresh = session.configuration[SVD_THRESH_ARG];

        try {
            await regs.sessionStarted(svd, thresh);     // Should never reject
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

    public togglePinPeripheral(node: PeripheralBaseNode) {
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
