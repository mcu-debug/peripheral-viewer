import * as vscode from 'vscode';
import { PeripheralTree } from '../peripheral-tree';
import { SvdCommands } from '../svd-commands';
import { DebugTracker } from '../debug-tracker';

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
    const peripheralTree = new PeripheralTree();
    const commands = new SvdCommands(peripheralTree);
    const tracker = new DebugTracker(peripheralTree);

    await peripheralTree.activate(context);
    await commands.activate(context);
    await tracker.activate(context);
};

export const deactivate = async (): Promise<void> => {
    // Do nothing for now
};
