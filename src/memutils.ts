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
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AddrRange, AddressRangesUtils } from './addrranges';
import * as manifest from './manifest';

/** Has utility functions to read memory in chunks into a storage space */
export class MemUtils {
    /**
     * Make one or more memory reads and update values. For the caller, it should look like a single
     * memory read but, if one read fails, all reads are considered as failed.
     *
     * @param startAddr The start address of the memory region. Everything else is relative to `startAddr`
     * @param specs The chunks of memory to read and and update. Addresses should be >= `startAddr`, Can have gaps, overlaps, etc.
     * @param storeTo This is where read-results go. The first element represents item at `startAddr`
     */
    public static async readMemoryChunks(
        session: vscode.DebugSession, startAddr: number, specs: AddrRange[], storeTo: Uint8Array, name?: string): Promise<Error[]> {
        const errors: Error[] = [];
        name = name || 'this memory chunk';
        for (const spec of specs) {
            const memoryReference = '0x' + spec.base.toString(16);
            const request: DebugProtocol.ReadMemoryArguments = {
                memoryReference,
                count: spec.length
            };

            try {
                const responseBody = await session.customRequest('readMemory', request);
                if (responseBody && responseBody.data) {
                    const bytes = Buffer.from(responseBody.data, 'base64');
                    let dst = spec.base - startAddr;
                    for (const byte of bytes) {
                        storeTo[dst++] = byte;
                    }
                } else {
                    errors.push(new Error(`peripheral-viewer: readMemory failed @ ${memoryReference} for ${request.count} bytes: No data returned, block=${name}`));
                }
            } catch (e: unknown) {
                const err = e ? e.toString() : 'Unknown error';
                errors.push(new Error(`${manifest.PACKAGE_NAME}: readMemory failed @ ${memoryReference} for ${request.count} bytes: ${err}, block=${name}`));
                if ((typeof e === 'object' && e !== null) && 'message' in e && (typeof e.message === 'string')) {
                    if (['notstopped', 'busy'].includes((e as Error).message.toLowerCase())) {
                        errors.push(new Error(`${manifest.PACKAGE_NAME}: responded with notstopped or busy error (probably because the target is not halted), ignoring, Aborting read for ${name} for now, can try again on next pause`));
                        break;
                    }
                }
            }
        }
        return errors;
    }

    public static readMemory(session: vscode.DebugSession, startAddr: number, length: number, storeTo: Uint8Array, name?: string): Promise<Error[]> {
        const maxChunk = manifest.MAX_READ_SIZE;
        const ranges = AddressRangesUtils.splitIntoChunks([new AddrRange(startAddr, length)], maxChunk);
        return MemUtils.readMemoryChunks(session, startAddr, ranges, storeTo, name);
    }

    public static async writeMemory(session: vscode.DebugSession, startAddr: number, value: number, length: number): Promise<boolean> {
        const memoryReference = '0x' + startAddr.toString(16);
        const numbytes = length / 8;
        const bytes = new Uint8Array(numbytes);

        // Assumes little endian?
        value = value >>> 0;
        for (let i = 0; i < numbytes; i++) {
            const byte = value & 0xFF;
            bytes[i] = byte;
            value = value >>> 8;
        }

        const data = Buffer.from(bytes).toString('base64');
        const request: DebugProtocol.WriteMemoryArguments = {
            memoryReference,
            data
        };

        try {
            await session.customRequest('writeMemory', request);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to write @ ${memoryReference}: ${e.toString()}`);
            return false;
        }
        return true;
    }
}
