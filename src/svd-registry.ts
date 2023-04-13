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

const CORTEX_EXTENSION = 'marus25.cortex-debug';

interface SVDInfo {
    expression: RegExp;
    path: string;
}

export class SvdRegistry {
    private SVDDirectory: SVDInfo[] = [];

    public registerSVDFile(expression: RegExp | string, path: string): void {
        if (typeof expression === 'string') {
            expression = new RegExp(`^${expression}$`, '');
        }

        this.SVDDirectory.push({ expression: expression, path: path });
    }

    public getSVDFile(device: string): string | undefined {
        // Try loading from device support pack registered with this extension
        const entry = this.SVDDirectory.find((de) => de.expression.test(device));
        if (entry) {
            return entry.path;
        }

        return undefined;
    }

    public async getSVDFileFromCortexDebug(device: string): Promise<string | undefined> {
        try {
            // Try loading from device support pack registered with this extension
            const cortexDebug = vscode.extensions.getExtension<SvdRegistry>(CORTEX_EXTENSION);
            if (cortexDebug) {
                const cdbg = await cortexDebug.activate();
                if (cdbg) {
                    return cdbg.getSVDFile(device);
                }
            }
        } catch(_e) {
            // Ignore error
        }

        return undefined;
    }
}
