/**
 * Copyright (C) 2023 Arm Limited
 */

import * as vscode from 'vscode';
import { PeripheralTreeProvider } from '../views/peripheral';
import { Commands } from '../commands';
import { DebugTrackerWrapper } from '../debug-tracker-wrapper';
import { SvdRegistry } from '../svd-registry';
import { SvdResolver } from '../svd-resolver';
import { logToOutputWindow } from '../vscode-utils';

export const activate = async (context: vscode.ExtensionContext): Promise<SvdRegistry> => {
    logToOutputWindow('Activating desktop version');

    const tracker = new DebugTrackerWrapper();
    const registry = new SvdRegistry();
    const resolver = new SvdResolver(registry);
    const peripheralTree = new PeripheralTreeProvider(tracker, resolver, context);
    const commands = new Commands(peripheralTree);

    await tracker.activate(context);
    await peripheralTree.activate();
    await commands.activate(context);

    return registry;
};

export const deactivate = async (): Promise<void> => {
    // Do nothing for now
};
