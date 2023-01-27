/*
 * Copyright 2017-2019 Marcel Ball
 * https://github.com/Marus/cortex-debug
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

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
