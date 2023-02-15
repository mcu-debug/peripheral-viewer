/**
 * Copyright (C) 2023 Arm Limited
 */

import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';

//
// TODO: We need to decide what to do here. I don't want two version of debug-trackers.
//
// 1. We can decide to use the SHARED extension version. There is no reason why the extension version
//    cannot work over the web/browser. Its extension Kind may need an update. But we should
//    use the npm module for the tracker instead of duplicating the interfaces/types here. That
//    npm module should be usable just as a dev-dependency
//
// 2. We incorporate the debug-tracker ourselves by using it as a dependency and it be used in
//    a non-shared mode.
//
// Either way, we should remove the duplication of interfaces here (already found one bug) and
// no need to have two versions
//
// And, once that re-write is complete, the copyright to be removed.
//

const DEBUG_TRACKER_EXTENSION = 'mcu-debug.debug-tracker-vscode';

interface IDebuggerTrackerEvent {
    event: DebugSessionStatus;
    sessionId: string;
    session?: vscode.DebugSession;
}

interface IDebuggerTrackerSubscribeArgBodyV1 {
    debuggers: string[] | '*';
    handler: (arg: IDebuggerTrackerEvent) => Promise<void>;
}

interface IDebuggerTrackerSubscribeArg {
    version: number;
    body: IDebuggerTrackerSubscribeArgBodyV1;
}

interface IDebugTracker {
    subscribe(arg: IDebuggerTrackerSubscribeArg): void;
}

enum DebugSessionStatus {
    Unknown = 'unknown',
    Initializing = 'initializing',
    Started = 'started',
    Stopped = 'stopped',
    Running = 'running',
    Terminated = 'terminated'
}

export class DebugTracker {
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
        const debugtracker = await this.getTracker();
        if (debugtracker) {
            // Use shared debug tracker extension
            debugtracker.subscribe({
                version: 1,
                body: {
                    debuggers: '*',
                    handler: async (event: IDebuggerTrackerEvent) => {
                        const session = this.sessionIdMap[event.sessionId];
                        if (event.event === DebugSessionStatus.Initializing && event.session) {
                            // Session is passed in only when session is initializing, so we have to cache it
                            this.sessionIdMap[event.sessionId] = event.session;
                            this._onWillStartSession.fire(event.session);
                        } else if (session) {
                            if (event.event === DebugSessionStatus.Terminated) {
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
            // Use vscode debug tracker
            const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.DebugAdapterTracker => {
                return {
                    onWillStartSession: () => this._onWillStartSession.fire(session),
                    onWillStopSession: () => this._onWillStopSession.fire(session),
                    onDidSendMessage: message => {
                        if (message.type === 'event' && message.event === 'stopped') {
                            this._onDidStopDebug.fire(session);
                        } else if (message.type === 'event' && message.event === 'continued') {
                            this._onDidContinueDebug.fire(session);
                        } else if (message.type === 'response') {
                            const continueCommands = ['continue', 'reverseContinue', 'step', 'stepIn', 'stepOut', 'stepBack', 'next', 'goto'];
                            const rsp: DebugProtocol.Response = message as DebugProtocol.Response;
                            if (rsp?.success && continueCommands.includes(rsp.command)) {
                                this._onDidContinueDebug.fire(session);
                            }
                        }
                    }
                };
            };

            context.subscriptions.push(
                vscode.debug.registerDebugAdapterTrackerFactory(this.debugType, { createDebugAdapterTracker })
            );
        }
    }

    private async getTracker(): Promise<IDebugTracker | undefined> {
        const trackerExtension = vscode.extensions.getExtension<IDebugTracker>(DEBUG_TRACKER_EXTENSION);
        if (trackerExtension) {
            return trackerExtension.activate();
        }

        return undefined;
    }
}
