import * as vscode from 'vscode';
import * as manifest from './manifest';
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
