/**
 * Originally, Copyright (C) 2023 Arm Limited
 *
 * But this file is almost a total re-write by haneefdm to exclusively use the debug-tracker as without it,
 * it is not simple to get notified of a continued event.
 */

import * as vscode from 'vscode';
import * as manifest from './manifest';
import { DebugSessionStatus, DebugTracker, IDebuggerTrackerEvent, IDebugTracker, TRACKER_EXT_ID } from 'debug-tracker-vscode';
import { setLogOutput, logOutputChannel, logToOutputWindow } from './vscode-utils';

export class DebugTrackerWrapper {
    private isLocalTracker = false;
    private dbgLevel: 0 | 1 | 2 = 0;
    public constructor(private debugType = '*') {
    }

    private _onWillStartSession: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onWillStartSession: vscode.Event<vscode.DebugSession> = this._onWillStartSession.event;

    private _onWillStopSession: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onWillStopSession: vscode.Event<vscode.DebugSession> = this._onWillStopSession.event;

    private _onDidStopDebug: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onDidStopDebug: vscode.Event<vscode.DebugSession> = this._onDidStopDebug.event;

    private _onDidContinueDebug: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onDidContinueDebug: vscode.Event<vscode.DebugSession> = this._onDidContinueDebug.event;

    private sessionIdMap: {[id: string]: vscode.DebugSession} = {};
    public async activate(context: vscode.ExtensionContext): Promise<void> {
        // TODO: Make this dynamic so reloads are needed if setting changes
        const dbgLevel = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.DEBUG_LEVEL, 0);
        if ((dbgLevel >= 0) && (dbgLevel <= 2)) {
            this.dbgLevel = dbgLevel as 0 | 1 | 2;
        }
        if (this.dbgLevel > 0) {
            setLogOutput(true);
        }
        logToOutputWindow('activating debug tracker');
        const debugtracker = await this.getTracker(context);
        if (debugtracker) {
            // Use shared debug tracker extension
            debugtracker.subscribe({
                version: 1,
                body: {
                    debuggers: '*',
                    handler: async (event: IDebuggerTrackerEvent) => {
                        if (!this.isLocalTracker || (this.dbgLevel > 1)) {
                            logToOutputWindow(JSON.stringify(event));
                        }
                        const session = this.sessionIdMap[event.sessionId];
                        if (event.session && event.event === DebugSessionStatus.Initializing) {
                            // Session is passed in only when session is initializing, so we have to cache it, but wait
                            // till session actually starts to fire the started event. It may never start
                            this.sessionIdMap[event.sessionId] = event.session;
                        } else if (session) {
                            if (event.event === DebugSessionStatus.Started) {
                                this._onWillStartSession.fire(session);
                            } else if (event.event === DebugSessionStatus.Terminated) {
                                this._onWillStopSession.fire(session);
                                delete this.sessionIdMap[event.sessionId];
                            } else if (event.event === DebugSessionStatus.Stopped) {
                                this._onDidStopDebug.fire(session);
                            } else if (event.event === DebugSessionStatus.Running) {
                                this._onDidContinueDebug.fire(session);
                            }
                        }
                    }
                }
            });
        } else {
            vscode.window.showErrorMessage('Fatal error: Could not start a debug tracker for peripheral-viewer');
        }
    }

    private async getTracker(context: vscode.ExtensionContext): Promise<IDebugTracker | undefined> {
        let ret: IDebugTracker | undefined;

        try {
            // If the extension was already installed and available, get the API handle from it, or
            // else create one locally
            const trackerExtension = vscode.extensions.getExtension<IDebugTracker>(TRACKER_EXT_ID);
            if (trackerExtension) {
                ret = await trackerExtension.activate();
            }
        } catch(_e) {
            // Ignore error
        }

        if (!ret) {
            // We could use our own channel in the future for debug
            this.isLocalTracker = true;
            logToOutputWindow('Using local debug tracker');
            ret = new DebugTracker(context, logOutputChannel, this.dbgLevel);
        } else {
            logToOutputWindow('Using shared debug tracker');
        }
        return ret;
    }
}
