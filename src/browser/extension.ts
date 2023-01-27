import * as vscode from 'vscode';
import { PeripheralTreeProvider } from '../views/peripheral';
import { Commands } from '../commands';
import { DebugTracker } from '../debug-tracker';
import { SvdRegistry } from '../svd-registry';

export const activate = async (context: vscode.ExtensionContext): Promise<SvdRegistry> => {
    const registry = new SvdRegistry();
    const tracker = new DebugTracker();
    const peripheralTree = new PeripheralTreeProvider(tracker, registry);
    const commands = new Commands(peripheralTree);

    await tracker.activate(context);
    await peripheralTree.activate(context);
    await commands.activate(context);

    return registry;
};

export const deactivate = async (): Promise<void> => {
    // Do nothing for now
};
