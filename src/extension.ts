import * as vscode from 'vscode';
import { PeripheralTreeProvider } from './views/peripheral';
import { PeripheralBaseNode } from './views/nodes/basenode';

import { NumberFormat } from './common';

interface SVDInfo {
    expression: RegExp;
    path: string;
}

export class CortexDebugExtension {
    private peripheralProvider: PeripheralTreeProvider;

    private peripheralTreeView: vscode.TreeView<PeripheralBaseNode>;
    private SVDDirectory: SVDInfo[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.peripheralProvider = new PeripheralTreeProvider();

        this.peripheralTreeView = vscode.window.createTreeView('cortex-debug.peripherals', {
            treeDataProvider: this.peripheralProvider
        });
                  
        context.subscriptions.push(
            vscode.commands.registerCommand('cortex-debug.peripherals.updateNode', this.peripheralsUpdateNode.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.copyValue', this.peripheralsCopyValue.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.setFormat', this.peripheralsSetFormat.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.forceRefresh', this.peripheralsForceRefresh.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.pin', this.peripheralsTogglePin.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.unpin', this.peripheralsTogglePin.bind(this)),

            vscode.debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)),
            vscode.debug.onDidTerminateDebugSession(this.debugSessionTerminated.bind(this)),

            this.peripheralTreeView,
            this.peripheralTreeView.onDidExpandElement((e) => {
                e.element.expanded = true;
                e.element.getPeripheral().updateData();
                this.peripheralProvider.refresh();
            }),
            this.peripheralTreeView.onDidCollapseElement((e) => {
                e.element.expanded = false;
            })
        );
    }

    public static getActiveCDSession() {
        const session = vscode.debug.activeDebugSession;
        if (session?.type === 'cortex-debug') {
            return session;
        }
        return null;
    }
    
    private getSVDFile(device: string): string {
        const entry = this.SVDDirectory.find((de) => de.expression.test(device));
        return entry ? entry.path : null;
    }

    public registerSVDFile(expression: RegExp | string, path: string): void {
        if (typeof expression === 'string') {
            expression = new RegExp(`^${expression}$`, '');
        }

        this.SVDDirectory.push({ expression: expression, path: path });
    }

    // Peripherals
    private peripheralsUpdateNode(node: PeripheralBaseNode): void {
        node.performUpdate().then((result) => {
            if (result) {
                this.peripheralProvider.refresh();
            }
        }, (error) => {
            vscode.window.showErrorMessage(`Unable to update value: ${error.toString()}`);
        });
    }

    private peripheralsCopyValue(node: PeripheralBaseNode): void {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv).then(() => {
            });
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

    private async peripheralsForceRefresh(node: PeripheralBaseNode): Promise<void> {
        if (node) {
            node.getPeripheral().updateData().then((e) => {
                this.peripheralProvider.refresh();
            });
        } else {
            this.peripheralProvider.refresh();
        }
    }

    private async peripheralsTogglePin(node: PeripheralBaseNode): Promise<void> {
        this.peripheralProvider.togglePinPeripheral(node);
        this.peripheralProvider.refresh();
    }

    // Debug Events
    private debugSessionStarted(session: vscode.DebugSession) {
        if (session.type !== 'cortex-debug') { return; }

        const newSession = CDebugSession.NewSessionStarted(session);

        this.functionSymbols = null;
        session.customRequest('get-arguments').then((args) => {
            newSession.config = args;
            let svdfile = args.svdFile;
            if (!svdfile) {
                svdfile = this.getSVDFile(args.device);
            }

            if (this.isDebugging(session)) {
                this.registerProvider.debugSessionStarted(session);
            }
            this.peripheralProvider.debugSessionStarted(session, (svdfile && !args.noDebug) ? svdfile : null, args.svdAddrGapThreshold);
        }, (error) => {
            vscode.window.showErrorMessage(
                `Internal Error: Could not get startup arguments. Many debug functions can fail. Please report this problem. Error: ${error}`);
        });
    }

    private debugSessionTerminated(session: vscode.DebugSession) {
        if (session.type !== 'cortex-debug') { return; }
        try {
            this.registerProvider.debugSessionTerminated(session);
            this.peripheralProvider.debugSessionTerminated(session);
        }
        catch (e) {
            vscode.window.showInformationMessage(`Debug session did not terminate cleanly ${e}\n${e ? e.stackstrace : ''}. Please report this problem`);
        }
        finally {
            CDebugSession.RemoveSession(session);
        }
    }

    // Assuming 'session' valid and it a cortex-debug session
    private isDebugging(session: vscode.DebugSession) {
        return true;
    }
}

export function activate(context: vscode.ExtensionContext) {
    return new CortexDebugExtension(context);
}

export function deactivate() {}
