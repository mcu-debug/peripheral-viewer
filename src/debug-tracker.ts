import * as vscode from 'vscode';

export class DebugTracker {
    public constructor(private debugType = '*') {
    }

    private _onWillStartSession: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onWillStartSession: vscode.Event<vscode.DebugSession> = this._onWillStartSession.event;

    private _onWillStopSession: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onWillStopSession: vscode.Event<vscode.DebugSession> = this._onWillStopSession.event;

    private _onDidStopSession: vscode.EventEmitter<vscode.DebugSession> = new vscode.EventEmitter<vscode.DebugSession>();
    public readonly onDidStopSession: vscode.Event<vscode.DebugSession> = this._onDidStopSession.event;

    public async activate(context: vscode.ExtensionContext): Promise<void> {
        const createDebugAdapterTracker = (session: vscode.DebugSession): vscode.DebugAdapterTracker => {
            return {
                onWillStartSession: () => this._onWillStartSession.fire(session),
                onWillStopSession: () => this._onWillStopSession.fire(session),
                onDidSendMessage: message => {
                    if (message.type === 'event' && message.event === 'stopped') {
                        this._onDidStopSession.fire(session);
                    }
                }
            };
        };

        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory(this.debugType, { createDebugAdapterTracker })
        );
    }
}
