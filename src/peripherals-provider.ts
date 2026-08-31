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
    } catch {
        return vscode.Uri.parse(path);
    }
};

const getData = async <T>(definition: string, ...params: unknown[]): Promise<T | undefined> => {
    if (definition.startsWith('command:')) {
        const command = definition.substring('command:'.length);
        return vscode.commands.executeCommand(command, ...params) as Promise<T | undefined>;
    }
    return definition as T;
};

/**
 * We want to use all the fields that make this svd cache still valid, since some of the
 * settings also affect what is in the cache.
 */
export interface CacheKey {
    fileOrUri: string;
    mtime: number;
    gapThreshold: number;
    maxReadSize: number;
    alignment: number;
}

export async function createCacheKey(fileOrUri: string | vscode.Uri): Promise<CacheKey> {
    const isString = typeof fileOrUri === 'string';
    let mtime = 0;
    try {
        const uri = isString ? pathToUri(fileOrUri as string) : fileOrUri;
        const stat = await vscode.workspace.fs.stat(uri);
        mtime = stat ? stat.mtime : 0;
    } catch {
        // Ignore errors and use the provided mtime
    }
    return {
        fileOrUri: isString ? fileOrUri : fileOrUri.toString(),
        mtime: mtime,
        gapThreshold: manifest.ADDRGAP_THRESHOLD,
        maxReadSize: manifest.MAX_READ_SIZE,
        alignment: manifest.ALIGNMENT
    };
}

export async function createCacheKeyString(fileOrUri: string | vscode.Uri): Promise<string> {
    const cacheKey = await createCacheKey(fileOrUri);
    return JSON.stringify(cacheKey);
}

export function setGlobalSettings() {
    const thresh = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.CONFIG_ADDRGAP) ?? manifest.DEFAULT_ADDRGAP;
    const maxReadSize = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.CONFIG_MAX_READ_SIZE) ?? manifest.DEFAULT_MAX_READ_SIZE;
    const alignment = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.CONFIG_ALIGNMENT) ?? manifest.DEFAULT_ALIGNMENT;
    const dbgLevel = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<number>(manifest.CONFIG_DEBUG_LEVEL) ?? manifest.DEFAULT_DEBUG_LEVEL;
    manifest.setMaxReadSize(maxReadSize);
    manifest.setAlignment(alignment);
    manifest.setAddrGapThreshold(thresh);
    manifest.setDebugLevel(dbgLevel);
}

export class PeripheralsProvider {
    readonly svdResolver: SvdResolver;
    constructor(protected session: vscode.DebugSession, protected context: vscode.ExtensionContext) {
        const registry = new SvdRegistry();
        this.svdResolver = new SvdResolver(registry);
    }

    private async cacheKey(): Promise<string | vscode.Uri | undefined> {
        const getPeripheralsCacheKeyConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_PERIPHERALS_CACHE_KEY) || manifest.DEFAULT_PERIPHERALS_CACHE_KEY;
        const getPeripheralsCacheKey = this.session.configuration[getPeripheralsCacheKeyConfig];

        if (getPeripheralsCacheKey) {
            return getPeripheralsCacheKey;
        }

        const wsFolderPath = this.session.workspaceFolder ? this.session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;
        const svdPath = await this.svdResolver.resolve(this.session, wsFolderPath);
        return svdPath;
    }

    public async cacheKeyString(): Promise<string | undefined> {
        const key = await this.cacheKey();
        if (!key) {
            return undefined;
        }
        return createCacheKeyString(key);
    }

    public async getPeripherals(): Promise<PeripheralNode[] | undefined> {
        const getPeripheralsConfig = vscode.workspace.getConfiguration(manifest.PACKAGE_NAME).get<string>(manifest.CONFIG_PERIPHERALS) || manifest.DEFAULT_PERIPHERALS;
        const getPeripherals = this.session.configuration[getPeripheralsConfig];

        if (getPeripherals) {
            return this.getPeripheralsDynamic(getPeripherals);
        } else {
            return this.getPeripheralsFromSVD();
        }
    }

    private async getPeripheralsDynamic(command: string): Promise<PeripheralNode[] | undefined> {
        const poptions = await getData<PeripheralOptions[]>(command, this.session);
        if (!poptions?.length) {
            return undefined;
        }
        const peripherials = poptions.map((options) => new PeripheralNode(manifest.ADDRGAP_THRESHOLD, options));
        const enumTypeValuesMap = {};
        for (const p of peripherials) {
            p.resolveDeferedEnums(enumTypeValuesMap); // This can throw an exception
            p.collectRanges();
        }
        return peripherials;
    }

    private async getPeripheralsFromSVD(): Promise<PeripheralNode[] | undefined> {
        const wsFolderPath = this.session.workspaceFolder ? this.session.workspaceFolder.uri : vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;

        const svdPath = await this.svdResolver.resolve(this.session, wsFolderPath);

        if (!svdPath) {
            return undefined;
        }

        let svdData: SvdData | undefined;

        try {
            let contents: ArrayBuffer | Uint8Array | undefined;

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
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(e);
        }

        if (!svdData) {
            return;
        }

        try {
            const parser = new SVDParser();
            return parser.parseSVD(svdData, manifest.ADDRGAP_THRESHOLD);
        } catch {
            return undefined;
        }
    }
}
