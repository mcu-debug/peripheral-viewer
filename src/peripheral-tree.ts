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

import { window, debug, ProviderResult, TreeItem, TreeDataProvider, EventEmitter, Event } from 'vscode';
import { PeripheralBaseNode } from './nodes/base-node';
import { PeripheralNode } from './nodes/peripheral-node';
import { SVDParser } from './svd-parser';

export class PeripheralTreeProvider implements TreeDataProvider<PeripheralBaseNode> {
    public _onDidChangeTreeData: EventEmitter<PeripheralBaseNode | undefined> = new EventEmitter<PeripheralBaseNode | undefined>();
    public readonly onDidChangeTreeData: Event<PeripheralBaseNode | undefined> = this._onDidChangeTreeData.event;

    private peripherials: PeripheralNode[] = [];
    private loaded = false;

    private async loadSVD(SVDData: string): Promise<void> {
        const peripherals = await SVDParser.parseSVD(SVDData);
        this.peripherials = peripherals;
        this.loaded = true;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public getTreeItem(element: PeripheralBaseNode): TreeItem | Promise<TreeItem> {
        return element.getTreeItem();
    }

    public getChildren(element?: PeripheralBaseNode): ProviderResult<PeripheralBaseNode[]> {
        if (this.loaded && this.peripherials.length > 0) {
            return element ? element.getChildren() : this.peripherials;
        }

        return [];
    }

    public async debugSessionStarted(svdData: string | undefined): Promise<void> {
        this.peripherials = [];
        this.loaded = false;
        this._onDidChangeTreeData.fire(undefined);

        if (svdData) {
            try {
                await this.loadSVD(svdData);
                this._onDidChangeTreeData.fire(undefined);
            } catch (e) {
                this.peripherials = [];
                this.loaded = false;
                this._onDidChangeTreeData.fire(undefined);
                const msg = `Unable to parse SVD file: ${e.toString()}`;
                window.showErrorMessage(msg);
                if (debug.activeDebugConsole) {
                    debug.activeDebugConsole.appendLine(msg);
                }
            }
        }
    }

    public debugSessionTerminated(): void {
        this.peripherials = [];
        this.loaded = false;
        this._onDidChangeTreeData.fire(undefined);
    }

    public async debugStopped(): Promise<void> {
        if (this.loaded) {
            try {
                const promises = this.peripherials.map((p) => p.updateData());
                await Promise.all(promises);
            } finally {
                this._onDidChangeTreeData.fire(undefined);
            }
        }
    }

    public togglePinPeripheral(node: PeripheralBaseNode): void {
        node.pinned = !node.pinned;
        this.peripherials.sort(PeripheralNode.compare);
    }
}
