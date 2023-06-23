import * as vscode from 'vscode';
import * as manifest from './manifest';
import { SvdResolver } from './svd-resolver';
import { PeripheralNode, PeripheralOptions } from './views/nodes/peripheralnode';
import { SvdData, SVDParser } from './svd-parser';
import { parseStringPromise } from 'xml2js';
import { readFromUrl } from './utils';
import { SvdRegistry } from './svd-registry';

const pathToUri = (path: string): vscode.Uri => {
    try {
        return vscode.Uri.file(path);
    } catch (e) {
        return vscode.Uri.parse(path);
    }
};

const getData = async <T>(definition: string, ...params: unknown[]) : Promise<T | undefined> => {
    if(definition.startsWith('command:')) {
        const command = definition.substring('command:'.length);
        return vscode.commands.executeCommand(command, ...params) as Promise<T | undefined>;
    }
    return definition as T;
};

export class PeripheralsProvider {
    readonly svdResolver: SvdResolver;
    constructor(protected session: vscode.DebugSession, protected context: vscode.ExtensionContext) {
        const registry = new SvdRegistry();
        this.svdResolver = new SvdResolver(registry);
    }

    public async cacheKey() : Promise<string | vscode.Uri | undefined> {
        const getPeripheralsCacheKeyConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_PERIPHERALS_CACHE_KEY) || manifest.DEFAULT_PERIPHERALS_CACHE_KEY;
        const getPeripheralsCacheKey = this.session.configuration[getPeripheralsCacheKeyConfig];

        if(getPeripheralsCacheKey) {
            return getPeripheralsCacheKey;
        }

        const wsFolderPath = this.session.workspaceFolder ? this.session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;
        const svdPath = await this.svdResolver.resolve(this.session, wsFolderPath);
        return svdPath;
    }

    public async getPeripherals(): Promise<PeripheralNode[] | undefined> {
        const getPeripheralsConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_PERIPHERALS) || manifest.DEFAULT_PERIPHERALS;
        const getPeripherals = this.session.configuration[getPeripheralsConfig];

        let thresh = this.session.configuration[manifest.CONFIG_ADDRGAP];
        if (!thresh) {
            thresh = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.CONFIG_ADDRGAP) || manifest.DEFAULT_ADDRGAP;
        }

        if (((typeof thresh) === 'number') && (thresh < 0)) {
            thresh = -1;     // Never merge register reads even if adjacent
        } else {
            // Set the threshold between 0 and 32, with a default of 16 and a mukltiple of 8
            thresh = ((((typeof thresh) === 'number') ? Math.max(0, Math.min(thresh, 32)) : 16) + 7) & ~0x7;
        }

        if(getPeripherals) {
            return this.getPeripheralsDynamic(thresh, getPeripherals);
        } else {
            return this.getPeripheralsFromSVD(thresh);
        }
    }

    private async getPeripheralsDynamic(thresh: number, command: string): Promise<PeripheralNode[] | undefined> {
        const poptions = await getData<PeripheralOptions[]>(command, this.session);
        if(!poptions?.length) {
            return undefined;
        }
        const peripherials  = poptions.map((options) => new PeripheralNode(thresh, options));
        const enumTypeValuesMap = {};
        for (const p of peripherials) {
            p.resolveDeferedEnums(enumTypeValuesMap); // This can throw an exception
            p.collectRanges();
        }
        return peripherials;
    }

    private async getPeripheralsFromSVD(thresh: number): Promise<PeripheralNode[] | undefined> {
        const wsFolderPath = this.session.workspaceFolder ? this.session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;

        const svdPath = await this.svdResolver.resolve(this.session, wsFolderPath);

        if (!svdPath) {
            return undefined;
        }

        let svdData: SvdData | undefined;

        try {
            let contents: ArrayBuffer | undefined;

            if (svdPath.startsWith('http')) {
                contents = await readFromUrl(svdPath);
            } else {
                const uri = pathToUri(svdPath);
                contents = await vscode.workspace.fs.readFile(uri);
            }

            if (contents) {
                const decoder = new TextDecoder();
                const xml = decoder.decode(contents);
                svdData = await parseStringPromise(xml);
            }
        } catch(e) {
            // eslint-disable-next-line no-console
            console.warn(e);
        }

        if (!svdData) {
            return;
        }

        try {
            const parser = new SVDParser();
            return parser.parseSVD(svdData, thresh);
        } catch(e) {
            return undefined;
        }
    }
}
