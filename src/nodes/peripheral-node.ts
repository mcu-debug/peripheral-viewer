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

import { debug, TreeItem, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import type { DebugProtocol } from 'vscode-debugprotocol';
import { PeripheralBaseNode } from './base-node';
import { AddrRange, AddressRangesInUse } from './address-ranges';
import { PeripheralRegisterNode } from './register-node';
import { PeripheralClusterNode } from './cluster-node';
import { AccessType, hexFormat, NumberFormat, NodeSetting } from '../util';

export interface PeripheralOptions {
    name: string;
    baseAddress: number;
    totalLength: number;
    description: string;
    groupName?: string;
    accessType?: AccessType;
    size?: number;
    resetValue?: number;
}

export class PeripheralNode extends PeripheralBaseNode {
    private children: Array<PeripheralRegisterNode | PeripheralClusterNode>;

    public readonly name: string;
    public readonly baseAddress: number;
    public readonly description: string;
    public readonly groupName: string;
    public readonly totalLength: number;
    public readonly accessType = AccessType.ReadOnly;
    public readonly size: number;
    public readonly resetValue: number;
    protected addrRanges: AddrRange[];

    private currentValue: number[] = [];

    constructor(options: PeripheralOptions) {
        super(undefined);

        this.name = options.name;
        this.baseAddress = options.baseAddress;
        this.totalLength = options.totalLength;
        this.description = options.description;
        this.groupName = options.groupName || '';
        this.resetValue = options.resetValue || 0;
        this.size = options.size || 32;
        this.children = [];
        this.addrRanges = [];
    }

    public getPeripheral(): PeripheralBaseNode {
        return this;
    }

    public getTreeItem(): TreeItem | Promise<TreeItem> {
        const label = `${this.name} @ ${hexFormat(this.baseAddress)}`;
        const item = new TreeItem(label, this.expanded ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.pinned ? 'peripheral.pinned' : 'peripheral';
        item.tooltip = this.description || undefined;
        if (this.pinned) {
            item.iconPath = new ThemeIcon('pinned');
        }
        return item;
    }

    public getCopyValue(): string {
        throw new Error('Method not implemented.');
    }

    public getChildren(): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]> {
        return this.children;
    }

    public setChildren(children: Array<PeripheralRegisterNode | PeripheralClusterNode>): void {
        this.children = children;
        this.children.sort((c1, c2) => c1.offset > c2.offset ? 1 : -1);
    }

    public addChild(child: PeripheralRegisterNode | PeripheralClusterNode): void {
        this.children.push(child);
        this.children.sort((c1, c2) => c1.offset > c2.offset ? 1 : -1);
    }

    public getBytes(offset: number, size: number): Uint8Array {
        try {
            return new Uint8Array(this.currentValue.slice(offset, offset + size));
        } catch (e) {
            return new Uint8Array(0);
        }
    }

    public getAddress(offset: number): number {
        return this.baseAddress + offset;
    }

    public getOffset(offset: number): number {
        return offset;
    }

    public getFormat(): NumberFormat {
        return this.format;
    }

    public async updateData(): Promise<void> {
        if (!this.expanded) {
            return;
        }

        try {
            await this.readMemory();
            const promises = this.children.map((r) => r.updateData());
            await Promise.all(promises);
        } catch (e) {
            const msg = e.message || 'unknown error';
            const str = `Failed to update peripheral ${this.name}: ${msg}`;
            if (debug.activeDebugConsole) {
                debug.activeDebugConsole.appendLine(str);
            }
            throw new Error(str);
        }
    }

    protected async readMemory(): Promise<void> {
        if (!this.currentValue) {
            this.currentValue = new Array<number>(this.totalLength);
        }

        const promises = this.addrRanges.map(r => this.readRangeMemory(r));
        await Promise.all(promises);
    }

    protected async readRangeMemory(r: AddrRange): Promise<void> {
        if (debug.activeDebugSession) {
            const memoryReference = '0x' + r.base.toString(16);
            const request: DebugProtocol.ReadMemoryArguments = {
                memoryReference,
                count: r.length
            };

            const response: Partial<DebugProtocol.ReadMemoryResponse> = {};
            response.body = await debug.activeDebugSession.customRequest('readMemory', request);

            if (response.body && response.body.data) {
                const data = Buffer.from(response.body.data, 'base64');
                let dst = r.base - this.baseAddress;
                for (const byte of data) {
                    this.currentValue[dst++] = byte;
                }
            }
        }
    }

    public markAddresses(): void {
        let ranges = [new AddrRange(this.baseAddress, this.totalLength)];   // Default range
        const skipAddressGaps = true;

        if (skipAddressGaps) {
            // Split the entire range into a set of smaller ranges. Some svd files specify
            // a very large address space but may use very little of it.
            const gapThreshold = 16;    // Merge gaps less than this many bytes, avoid too many gdb requests
            const addresses = new AddressRangesInUse(this.totalLength);
            this.children.map((child) => child.markAddresses(addresses));
            ranges = addresses.getAddressRangesOptimized(this.baseAddress, false, gapThreshold);
        }

        // OpenOCD has an issue where the max number of bytes readable are 8191 (instead of 8192)
        // which causes unaligned reads (via gdb) and silent failures. There is patch for this in OpenOCD
        // but in general, it is good to split the reads up. see http://openocd.zylin.com/#/c/5109/
        // Another benefit, we can minimize gdb timeouts
        const maxBytes = (4 * 1024); // Should be a multiple of 4 to be safe for MMIO reads
        this.addrRanges = AddressRangesInUse.splitIntoChunks(ranges, maxBytes);
    }

    public getPeripheralNode(): PeripheralNode {
        return this;
    }

    public saveState(): NodeSetting[] {
        const results: NodeSetting[] = [];

        if (this.format !== NumberFormat.Auto || this.expanded || this.pinned) {
            results.push({
                node: `${this.name}`,
                expanded: this.expanded,
                format: this.format,
                pinned: this.pinned
            });
        }

        this.children.forEach((c) => {
            results.push(...c.saveState(`${this.name}`));
        });

        return results;
    }

    public findByPath(path: string[]): PeripheralBaseNode | undefined {
        if (path.length === 0) { return this; } else {
            const child = this.children.find((c) => c.name === path[0]);
            if (child) { return child.findByPath(path.slice(1)); } else { return undefined; }
        }
    }

    public performUpdate(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    public static compare(p1: PeripheralNode, p2: PeripheralNode): number {
        if ((p1.pinned && p2.pinned) || (!p1.pinned && !p2.pinned)) {
            // none or both peripherals are pinned, sort by name prioritizing groupname
            if (p1.groupName !== p2.groupName) {
                return p1.groupName > p2.groupName ? 1 : -1;
            } else if (p1.name !== p2.name) {
                return p1.name > p2.name ? 1 : -1;
            } else {
                return 0;
            }
        } else {
            return p1.pinned ? -1 : 1;
        }
    }
}
