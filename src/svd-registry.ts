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
        // Try loading from device support pack registered with this extension
        const cortexDebug = vscode.extensions.getExtension(CORTEX_EXTENSION);
        if (cortexDebug) {
            const cdbg = await cortexDebug.activate();
            if (cdbg) {
                const entry = cdbg.getSVDFile(device);
                if (entry) {
                    return entry.path;
                }
            }
        }

        return undefined;
    }
}
