import * as vscode from 'vscode';
import * as manifest from './manifest';
import { parseStringPromise } from 'xml2js';
import { PeripheralTree } from './peripheral-tree';

const CORTEX_EXTENSION = 'marus25.cortex-debug';

const pathToUri = (path: string): vscode.Uri => {
    try {
        return vscode.Uri.file(path);
    } catch (e) {
        return vscode.Uri.parse(path);
    }
};

export class DebugTracker {
    public constructor(protected tree: PeripheralTree) {
    }

    public async activate(context: vscode.ExtensionContext): Promise<void> {
        const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.DebugAdapterTracker => {
            return {
                onWillStartSession: () => this.debugSessionStarted(session),
                onWillStopSession: () => this.debugSessionTerminated(session),
                onDidSendMessage: message => {
                    if (message.type === 'event' && message.event === 'stopped') {
                        this.tree.debugStopped();
                    }
                }
            };
        };

        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('*', { createDebugAdapterTracker })
        );
    }

    protected async debugSessionStarted(session: vscode.DebugSession): Promise<void> {
        let svdData: string | undefined;

        const svdConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_SVD_PATH) || manifest.DEFAULT_SVD_PATH;
        let svd = session.configuration[svdConfig];

        if (!svd) {
            // Try loading from device support pack
            try {
                const deviceConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_DEVICE) || manifest.DEFAULT_DEVICE;
                const device = session.configuration[deviceConfig];

                if (device) {
                    const cortexDebug = vscode.extensions.getExtension(CORTEX_EXTENSION);
                    if (cortexDebug) {
                        const cdbg = await cortexDebug.activate();
                        svd = cdbg.getSVDFile(device);
                    }
                }
            } catch(e) {
                // eslint-disable-next-line no-console
                console.warn(e);
            }
        }

        if (svd) {
            try {
                const uri = pathToUri(svd);
                const contents = await vscode.workspace.fs.readFile(uri);

                const decoder = new TextDecoder();
                const xml = decoder.decode(contents);
                svdData = await parseStringPromise(xml);
            } catch(e) {
                // eslint-disable-next-line no-console
                console.warn(e);
            }
        }

        vscode.commands.executeCommand('setContext', `${manifest.PACKAGE_NAME}.svd.hasData`, !!svdData);

        if (svdData) {
            this.tree.debugSessionStarted(svdData);
        }
    }

    protected debugSessionTerminated(_session: vscode.DebugSession): void {
        vscode.commands.executeCommand('setContext', `${manifest.PACKAGE_NAME}.svd.hasData`, false);
        this.tree.debugSessionTerminated();
    }
}
