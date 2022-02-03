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

import { Command, TreeItem } from 'vscode';
import { AddressRangesInUse } from './address-ranges';
import { NumberFormat, NodeSetting } from '../util';

export abstract class PeripheralBaseNode {
    public expanded: boolean;
    public format: NumberFormat;
    public pinned: boolean;
    public readonly name: string | undefined;

    constructor(protected readonly parent?: PeripheralBaseNode) {
        this.expanded = false;
        this.format = NumberFormat.Auto;
        this.pinned = false;
    }

    public getCommand(): Command | undefined {
        return undefined;
    }

    public getParent(): PeripheralBaseNode | undefined {
        return this.parent;
    }

    public abstract getCopyValue(): string | undefined;
    public abstract performUpdate(): Promise<boolean>;
    public abstract updateData(): Promise<void>;

    public abstract getChildren(): PeripheralBaseNode[] | Promise<PeripheralBaseNode[]>;
    public abstract getPeripheral(): PeripheralBaseNode | undefined;
    public abstract getTreeItem(): TreeItem | Promise<TreeItem>;

    public abstract markAddresses(a: AddressRangesInUse): void;

    public abstract saveState(path?: string): NodeSetting[];
    public abstract findByPath(path: string[]): PeripheralBaseNode | undefined;
}
