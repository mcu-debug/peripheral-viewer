import * as vscode from 'vscode';
import { PeripheralTreeProvider } from './views/peripheral';
import { BaseNode, PeripheralBaseNode } from './views/nodes/basenode';

import { NumberFormat,
    RTTCommonDecoderOpts, RTTConsoleDecoderOpts,
    CortexDebugKeys, ChainedEvents, ADAPTER_DEBUG_MODE } from './common';

interface SVDInfo {
    expression: RegExp;
    path: string;
}

class ServerStartedPromise {
    constructor(
        public readonly name: string,
        public readonly promise: Promise<vscode.DebugSessionCustomEvent>,
        public readonly resolve: any,
        public readonly reject: any) {
    }
}

export class CortexDebugExtension {
    private peripheralProvider: PeripheralTreeProvider;

    private peripheralTreeView: vscode.TreeView<PeripheralBaseNode>;
    private registerTreeView: vscode.TreeView<BaseNode>;

    private SVDDirectory: SVDInfo[] = [];
    private serverStartedEvent: ServerStartedPromise;

    constructor(private context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('cortex-debug');
        this.peripheralProvider = new PeripheralTreeProvider();

        this.peripheralTreeView = vscode.window.createTreeView('cortex-debug.peripherals', {
            treeDataProvider: this.peripheralProvider
        });

        vscode.commands.executeCommand('setContext', `cortex-debug:${CortexDebugKeys.REGISTER_DISPLAY_MODE}`,
            config.get(CortexDebugKeys.REGISTER_DISPLAY_MODE, true));
        vscode.commands.executeCommand('setContext', `cortex-debug:${CortexDebugKeys.VARIABLE_DISPLAY_MODE}`,
            config.get(CortexDebugKeys.VARIABLE_DISPLAY_MODE, true));
                  
        context.subscriptions.push(
            vscode.commands.registerCommand('cortex-debug.peripherals.updateNode', this.peripheralsUpdateNode.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.copyValue', this.peripheralsCopyValue.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.setFormat', this.peripheralsSetFormat.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.forceRefresh', this.peripheralsForceRefresh.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.pin', this.peripheralsTogglePin.bind(this)),
            vscode.commands.registerCommand('cortex-debug.peripherals.unpin', this.peripheralsTogglePin.bind(this)),
            
            vscode.commands.registerCommand('cortex-debug.registers.copyValue', this.registersCopyValue.bind(this)),
            vscode.commands.registerCommand('cortex-debug.registers.refresh', this.registersRefresh.bind(this)),
            vscode.commands.registerCommand('cortex-debug.registers.regHexModeTurnOn', this.registersNaturalMode.bind(this, false)),
            vscode.commands.registerCommand('cortex-debug.registers.regHexModeTurnOff', this.registersNaturalMode.bind(this, true)),
            vscode.commands.registerCommand('cortex-debug.varHexModeTurnOn', this.variablesNaturalMode.bind(this, false)),
            vscode.commands.registerCommand('cortex-debug.varHexModeTurnOff', this.variablesNaturalMode.bind(this, true)),
            vscode.commands.registerCommand('cortex-debug.toggleVariableHexFormat', this.toggleVariablesHexMode.bind(this)),


            vscode.commands.registerCommand('cortex-debug.pvtEnableDebug', this.pvtCycleDebugMode.bind(this)),

            vscode.workspace.onDidChangeConfiguration(this.settingsChanged.bind(this)),
            vscode.debug.onDidReceiveDebugSessionCustomEvent(this.receivedCustomEvent.bind(this)),
            vscode.debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)),
            vscode.debug.onDidTerminateDebugSession(this.debugSessionTerminated.bind(this)),
            vscode.window.onDidChangeActiveTextEditor(this.activeEditorChanged.bind(this)),
            vscode.window.onDidCloseTerminal(this.terminalClosed.bind(this)),
            vscode.workspace.onDidCloseTextDocument(this.textDocsClosed.bind(this)),
            vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
                if (e && e.textEditor.document.fileName.endsWith('.cdmem')) { this.memoryProvider.handleSelection(e); }
            }),

            this.registerTreeView,
            this.registerTreeView.onDidCollapseElement((e) => {
                e.element.expanded = false;
            }),
            this.registerTreeView.onDidExpandElement((e) => {
                e.element.expanded = true;
            }),
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




    private settingsChanged(e: vscode.ConfigurationChangeEvent) {
        if (e.affectsConfiguration(`cortex-debug.${CortexDebugKeys.REGISTER_DISPLAY_MODE}`)) {
            let count = 0;
            for (const s of CDebugSession.CurrentSessions) {
                // Session may not have actually started according to VSCode but we know of it
                if ((s.status === 'stopped') && this.isDebugging(s.session)) {
                    this.registerProvider.refresh(s.session);
                    count++;
                }
            }
            if (count !== CDebugSession.CurrentSessions.length) {
                const partial = count > 0 ? 'Some sessions updated. ' : '';
                const msg = `Cortex-Debug: ${partial}New format will take effect next time the session pauses`;
                vscode.window.showInformationMessage(msg);
            }
        }
        if (e.affectsConfiguration(`cortex-debug.${CortexDebugKeys.VARIABLE_DISPLAY_MODE}`)) {
            const config = vscode.workspace.getConfiguration('cortex-debug');
            const isHex = config.get(CortexDebugKeys.VARIABLE_DISPLAY_MODE, true) ? false : true;
            let foundStopped = false;
            for (const s of CDebugSession.CurrentSessions) {
                try {
                    // Session may not have actually started according to VSCode but we know of it
                    if (this.isDebugging(s.session)) {
                        s.session.customRequest('set-var-format', { hex: isHex });
                        if (s.status === 'stopped') {
                            foundStopped = true;
                        }
                    }
                }
                catch (e) {
                }
            }
            if (!foundStopped) {
                const fmt = isHex ? 'hex' : 'dec';
                const msg = `Cortex-Debug: Variables window format "${fmt}" will take effect next time the session pauses`;
                vscode.window.showInformationMessage(msg);
            }
        }
        if (e.affectsConfiguration(`cortex-debug.${CortexDebugKeys.SERVER_LOG_FILE_NAME}`)) {
            const config = vscode.workspace.getConfiguration('cortex-debug');
            const fName = config.get(CortexDebugKeys.SERVER_LOG_FILE_NAME, '');
            this.gdbServerConsole.createLogFile(fName);
        }
        if (e.affectsConfiguration(`cortex-debug.${CortexDebugKeys.DEV_DEBUG_MODE}`)) {
            const config = vscode.workspace.getConfiguration('cortex-debug');
            const dbgMode = config.get(CortexDebugKeys.DEV_DEBUG_MODE, ADAPTER_DEBUG_MODE.NONE);
            for (const s of CDebugSession.CurrentSessions) {
                try {
                    s.session.customRequest('set-debug-mode', { mode: dbgMode });
                }
                catch (e) {
                }
            }
        }
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
                Reporting.sendEvent('Peripheral View', 'Update Node');
            }
        }, (error) => {
            vscode.window.showErrorMessage(`Unable to update value: ${error.toString()}`);
        });
    }

    private peripheralsCopyValue(node: PeripheralBaseNode): void {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv).then(() => {
                Reporting.sendEvent('Peripheral View', 'Copy Value');
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

    private variablesNaturalMode(newVal: boolean, cxt?: any) {
        // 'cxt' contains the treeItem on which this menu was invoked. Maybe we can do something
        // with it later
        const config = vscode.workspace.getConfiguration('cortex-debug');

        vscode.commands.executeCommand('setContext', `cortex-debug:${CortexDebugKeys.VARIABLE_DISPLAY_MODE}`, newVal);
        try {
            config.update(CortexDebugKeys.VARIABLE_DISPLAY_MODE, newVal);
        }
        catch (e) {
            console.error(e);
        }
    }

    private toggleVariablesHexMode() {
        // 'cxt' contains the treeItem on which this menu was invoked. Maybe we can do something
        // with it later
        const config = vscode.workspace.getConfiguration('cortex-debug');
        const curVal = config.get(CortexDebugKeys.VARIABLE_DISPLAY_MODE, true);
        const newVal = !curVal;
        vscode.commands.executeCommand('setContext', `cortex-debug:${CortexDebugKeys.VARIABLE_DISPLAY_MODE}`, newVal);
        try {
            config.update(CortexDebugKeys.VARIABLE_DISPLAY_MODE, newVal);
        }
        catch (e) {
            console.error(e);
        }
    }

    private pvtCycleDebugMode() {
        const config = vscode.workspace.getConfiguration('cortex-debug');
        const curVal: ADAPTER_DEBUG_MODE = config.get(CortexDebugKeys.DEV_DEBUG_MODE, ADAPTER_DEBUG_MODE.NONE);
        const validVals = Object.values(ADAPTER_DEBUG_MODE);
        let ix = validVals.indexOf(curVal);
        ix = ix < 0 ? ix = 0 : ((ix + 1) % validVals.length);
        config.set(CortexDebugKeys.DEV_DEBUG_MODE, validVals[ix]);
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

            Reporting.beginSession(session.id, args as ConfigurationArguments);

            if (newSession.swoSource) {
                this.initializeSWO(session, args);
            }

            if (this.isDebugging(session)) {
                this.registerProvider.debugSessionStarted(session);
            }
            this.peripheralProvider.debugSessionStarted(session, (svdfile && !args.noDebug) ? svdfile : null, args.svdAddrGapThreshold);
            this.cleanupRTTTerminals();
        }, (error) => {
            vscode.window.showErrorMessage(
                `Internal Error: Could not get startup arguments. Many debug functions can fail. Please report this problem. Error: ${error}`);
        });
    }

    private debugSessionTerminated(session: vscode.DebugSession) {
        if (session.type !== 'cortex-debug') { return; }
        const mySession = CDebugSession.FindSession(session);
        try {
            Reporting.endSession(session.id);

            this.registerProvider.debugSessionTerminated(session);
            this.peripheralProvider.debugSessionTerminated(session);
            if (mySession?.swo) {
                mySession.swo.debugSessionTerminated();
            }
            if (mySession?.swoSource) {
                mySession.swoSource.dispose();
            }
            if (mySession?.rtt) {
                mySession.rtt.debugSessionTerminated();
            }
            if (mySession?.rttPortMap) {
                for (const ch of Object.keys(mySession.rttPortMap)) {
                    mySession.rttPortMap[ch].dispose();
                }
                mySession.rttPortMap = {};
            }
        }
        catch (e) {
            vscode.window.showInformationMessage(`Debug session did not terminate cleanly ${e}\n${e ? e.stackstrace : ''}. Please report this problem`);
        }
        finally {
            CDebugSession.RemoveSession(session);
        }
    }

    private receivedCustomEvent(e: vscode.DebugSessionCustomEvent) {
        const session = e.session;
        if (session.type !== 'cortex-debug') { return; }
        switch (e.event) {
            case 'custom-stop':
                this.receivedStopEvent(e);
                break;
            case 'custom-continued':
                this.receivedContinuedEvent(e);
                break;
            case 'swo-configure':
                this.receivedSWOConfigureEvent(e);
                break;
            case 'rtt-configure':
                this.receivedRTTConfigureEvent(e);
                break;
            case 'record-event':
                this.receivedEvent(e);
                break;
            case 'custom-event-open-disassembly':
                vscode.commands.executeCommand('editor.debug.action.openDisassemblyView');
                break;
            case 'custom-event-post-start-server':
                this.startChainedConfigs(e, ChainedEvents.POSTSTART);
                break;
            case 'custom-event-post-start-gdb':
                this.startChainedConfigs(e, ChainedEvents.POSTINIT);
                break;
            case 'custom-event-session-terminating':
                ServerConsoleLog('Got event for sessions terminating', process.pid);
                this.endChainedConfigs(e);
                break;
            case 'custom-event-session-restart':
                this.resetOrResartChained(e, 'restart');
                break;
            case 'custom-event-session-reset':
                this.resetOrResartChained(e, 'reset');
                break;
            case 'custom-event-popup':
                const msg = e.body.info?.message;
                switch (e.body.info?.type) {
                    case 'warning':
                        vscode.window.showWarningMessage(msg);
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(msg);
                        break;
                    default:
                        vscode.window.showInformationMessage(msg);
                        break;
                }
                break;
            case 'custom-event-ports-allocated':
                this.registerPortsAsUsed(e);
                break;
            case 'custom-event-ports-done':
                this.signalPortsAllocated(e);
                break;
            default:
                break;
        }
    }

    private signalPortsAllocated(e: vscode.DebugSessionCustomEvent) {
        if (this.serverStartedEvent) {
            this.serverStartedEvent.resolve(e);
            this.serverStartedEvent = undefined;
        }
    }

    private registerPortsAsUsed(e: vscode.DebugSessionCustomEvent) {
        // We can get this event before the session starts
        const mySession = CDebugSession.GetSession(e.session);
        mySession.addUsedPorts(e.body?.info || []);
    }

    private async startChainedConfigs(e: vscode.DebugSessionCustomEvent, evType: ChainedEvents) {
        const adapterArgs = e?.body?.info as ConfigurationArguments;
        const cDbgParent = CDebugSession.GetSession(e.session, adapterArgs);
        if (!adapterArgs || !adapterArgs.chainedConfigurations?.enabled) { return; }
        const unique = adapterArgs.chainedConfigurations.launches.filter((x, ix) => {
            return ix === adapterArgs.chainedConfigurations.launches.findIndex((v, ix) => v.name === x.name);
        });
        const filtered = unique.filter((launch) => {
            return (launch.enabled && (launch.waitOnEvent === evType) && launch.name);
        });

        let delay = 0;
        let count = filtered.length;
        for (const launch of filtered) {
            count--;
            const childOptions: vscode.DebugSessionOptions = {
                consoleMode              : vscode.DebugConsoleMode.Separate,
                noDebug                  : adapterArgs.noDebug,
                compact                  : false
            };
            if (launch.lifecycleManagedByParent) {
                // VSCode 'lifecycleManagedByParent' does not work as documented. The fact that there
                // is a parent means it is managed and 'lifecycleManagedByParent' if ignored.
                childOptions.lifecycleManagedByParent = true;
                childOptions.parentSession = e.session;
            }
            delay += Math.max(launch.delayMs || 0, 0);
            const child = new CDebugChainedSessionItem(cDbgParent, launch, childOptions);
            const folder = this.getWsFolder(launch.folder, e.session.workspaceFolder, launch.name);
            setTimeout(() => {
                vscode.debug.startDebugging(folder, launch.name, childOptions).then((success) => {
                    if (!success) {
                        vscode.window.showErrorMessage('Failed to launch chained configuration ' + launch.name);
                    }
                    CDebugChainedSessionItem.RemoveItem(child);
                }, (e) => {
                    vscode.window.showErrorMessage(`Failed to launch chained configuration ${launch.name}: ${e}`);
                    CDebugChainedSessionItem.RemoveItem(child);
                });
            }, delay);
            if (launch && launch.detached && (count > 0)) {
                try {
                    // tslint:disable-next-line: one-variable-per-declaration
                    let res: (value: vscode.DebugSessionCustomEvent) => void;
                    let rej: (reason?: any) => void;
                    const prevStartedPromise = new Promise<vscode.DebugSessionCustomEvent>((resolve, reject) => {
                        res = resolve;
                        rej = reject;
                    });
                    this.serverStartedEvent = new ServerStartedPromise(launch.name, prevStartedPromise, res, rej);
                    let to = setTimeout(() => {
                        if (this.serverStartedEvent) {
                            this.serverStartedEvent.reject(new Error(`Timeout starting chained session: ${launch.name}`));
                            this.serverStartedEvent = undefined;
                        }
                        to = undefined;
                    }, 5000);
                    await prevStartedPromise;
                    if (to) { clearTimeout(to); }
                }
                catch (e) {
                    vscode.window.showErrorMessage(`Detached chained configuration launch failed? Aborting rest. Error: ${e}`);
                    break;      // No more children after this error
                }
                delay = 0;
            } else {
                delay += 5;
            }
        }
    }

    private endChainedConfigs(e: vscode.DebugSessionCustomEvent) {
        const mySession = CDebugSession.FindSession(e.session);
        if (mySession && mySession.hasChildren) {
            // Note that we may not be the root, but we have children. Also we do not modify the tree while iterating it
            const deathList: CDebugSession[] = [];
            const orphanList: CDebugSession[] = [];
            mySession.broadcastDFS((s) => {
                if (s === mySession) { return; }
                if (s.config.pvtMyConfigFromParent.lifecycleManagedByParent) {
                    deathList.push(s);      // Qualifies to be terminated
                } else {
                    orphanList.push(s);     // This child is about to get orphaned
                }
            }, false);

            // According to current scheme, there should not be any orphaned children.
            while (orphanList.length > 0) {
                const s = orphanList.pop();
                s.moveToRoot();     // Or should we move to our parent. TODO: fix for when we are going to have grand children
            }

            while (deathList.length > 0) {
                const s = deathList.pop();
                // We cannot actually use the following API. We have to do this ourselves. Probably because we own
                // the lifetime management.
                // vscode.debug.stopDebugging(s.session);
                ServerConsoleLog(`Sending custom-stop-debugging to ${s.session.name}`, process.pid);
                s.session.customRequest('custom-stop-debugging', e.body.info).then(() => {
                }, (reason) => {
                    vscode.window.showErrorMessage(`Cortex-Debug: Bug? session.customRequest('set-stop-debugging-type', ... failed ${reason}\n`);
                });
            }
            // Following does not work. Apparently, a customRequest cannot be sent probably because this session is already
            // terminating.
            // mySession.session.customRequest('notified-children-to-terminate');
        }
    }

    private resetOrResartChained(e: vscode.DebugSessionCustomEvent, type: 'reset' | 'restart') {
        const mySession = CDebugSession.FindSession(e.session);
        if (mySession && mySession.hasChildren) {
            mySession.broadcastDFS((s) => {
                if (s === mySession) { return; }
                if (s.config.pvtMyConfigFromParent.lifecycleManagedByParent) {
                    s.session.customRequest('reset-device', type).then(() => {
                    }, (reason) => {
                    });
                }
            }, false);
        }
    }

    private getWsFolder(folder: string, def: vscode.WorkspaceFolder, childName): vscode.WorkspaceFolder {
        if (folder) {
            const orig = folder;
            const normalize = (fsPath: string) => {
                fsPath = path.normalize(fsPath).replace(/\\/g, '/');
                fsPath = (fsPath === '/') ? fsPath : fsPath.replace(/\/+$/, '');
                if (process.platform === 'win32') {
                    fsPath = fsPath.toLowerCase();
                }
                return fsPath;
            };
            // Folder is always a full path name
            folder = normalize(folder);
            for (const f of vscode.workspace.workspaceFolders) {
                const tmp = normalize(f.uri.fsPath);
                if ((f.uri.fsPath === folder) || (f.name === folder) || (tmp === folder)) {
                    return f;
                }
            }
            vscode.window.showInformationMessage(
                `Chained configuration for '${childName}' specified folder is '${orig}' normalized path is '${folder}'` +
                ' did not match any workspace folders. Using parents folder.');
        }
        return def;
    }

    // Assuming 'session' valid and it a cortex-debug session
    private isDebugging(session: vscode.DebugSession) {
        return true;
    }

    private receivedStopEvent(e: vscode.DebugSessionCustomEvent) {
        const mySession = CDebugSession.FindSession(e.session);
        mySession.status = 'stopped';
        this.peripheralProvider.debugStopped(e.session);
        if (this.isDebugging(e.session)) {
            this.registerProvider.debugStopped(e.session);
        }
        vscode.workspace.textDocuments.filter((td) => td.fileName.endsWith('.cdmem')).forEach((doc) => {
            if (!doc.isClosed) {
                this.memoryProvider.update(doc);
            }
        });
        if (mySession.swo) { mySession.swo.debugStopped(); }
        if (mySession.rtt) { mySession.rtt.debugStopped(); }
    }

    private receivedContinuedEvent(e: vscode.DebugSessionCustomEvent) {
        const mySession = CDebugSession.FindSession(e.session);
        mySession.status = 'running';
        this.peripheralProvider.debugContinued();
        if (this.isDebugging(e.session)) {
            this.registerProvider.debugContinued();
        }
        if (mySession.swo) { mySession.swo.debugContinued(); }
        if (mySession.rtt) { mySession.rtt.debugContinued(); }
    }
}

export function activate(context: vscode.ExtensionContext) {
    return new CortexDebugExtension(context);
}

export function deactivate() {}
