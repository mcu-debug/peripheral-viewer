export enum ADAPTER_DEBUG_MODE {
    NONE = 'none',
    PARSED = 'parsed',
    BOTH = 'both',
    RAW = 'raw',
    VSCODE = 'vscode'
}

export enum CortexDebugKeys {
    REGISTER_DISPLAY_MODE = 'registerUseNaturalFormat',
    VARIABLE_DISPLAY_MODE = 'variableUseNaturalFormat',
    SERVER_LOG_FILE_NAME = 'dbgServerLogfile',
    DEV_DEBUG_MODE = 'showDevDebugOutput'
}

export enum NumberFormat {
    Auto = 0,
    Hexadecimal,
    Decimal,
    Binary
}

export interface NodeSetting {
    node: string;
    expanded?: boolean;
    format?: NumberFormat;
    pinned?: boolean;
}

export interface SWOConfigureBody {
    type: string;
    args: any;            // Configuration arguments
    port?: string;        // [hostname:]port
    path?: string;        // path to file, fifo, etc.
    device?: string;      // path to serial port
    baudRate?: number;
}

export enum TerminalInputMode {
    COOKED = 'cooked',
    RAW = 'raw',
    RAWECHO = 'rawecho',
    DISABLED = 'disabled'
}
export interface RTTCommonDecoderOpts {
    type: string;     // 'console', 'graph', ...
    tcpPort: string;  // [hostname:]port
    port: number;     // RTT Channel number

    // Following two used for 'Advanced' category
    tcpPorts: string[];
    ports: number[];
}

export enum TextEncoding {
    UTF8 = 'utf8',
    UTF16LE = 'utf16le',
    ASCII = 'ascii',
    UCS2 = 'ucs2'
}

export enum BinaryEncoding {
    UNSIGNED = 'unsigned',
    SIGNED = 'signed',
    Q1616 = 'Q16.16',
    FLOAT = 'float'
}

export interface CTIOpenOCDConfig {
    enabled: boolean;
    initCommands: string[];
    pauseCommands: string[];
    resumeCommands: string[];
}

export interface RTTConsoleDecoderOpts extends RTTCommonDecoderOpts {
    // Console  options
    label: string;      // label for window
    prompt: string;     // Prompt to use
    noprompt: boolean;  // disable prompt
    noclear: boolean;   // do not clear screen buffer on connect
    logfile: string;    // log IO to file
    inputmode: TerminalInputMode;
    iencoding: TextEncoding;       // Encoding used for input
    timestamp: boolean;
    // Binary only options
    scale: number;
    encoding: BinaryEncoding;
}

export enum ChainedEvents {
    POSTSTART = 'postStart', // Default - a connection was established with the gdb-server, before initialization is done
    POSTINIT = 'postInit'    // all init functionality has been done. Generally past programming and stopped at or
                             // past reset-vector but depends on customizations
}
export interface ChainedConfig {
    enabled: boolean;
    name: string;           // Debug configuration to launch (could be attach or launch)
    delayMs: number;
    waitOnEvent: ChainedEvents;
    detached: boolean;
    lifecycleManagedByParent: boolean;
    folder: string;
    overrides: {[key: string]: any};
    inherits: string[];
}

export interface ChainedConfigurations {
    enabled: boolean;
    launches: ChainedConfig[];
    waitOnEvent: ChainedEvents;
    detached: boolean;
    lifecycleManagedByParent: boolean;
    delayMs: number;
    overrides: {[key: string]: any};
    inherits: string[];
}

export interface SWOConfiguration {
    enabled: boolean;
    cpuFrequency: number;
    swoFrequency: number;
    decoders: any[];
    profile: boolean;
    source: string;
    swoPort: string;
    swoPath: string;
}

export interface RTTConfiguration {
    enabled: boolean;
    address: string;
    searchSize: number;
    searchId: string;
    clearSearch: boolean;
    polling_interval: number;
    rtt_start_retry: number;
    decoders: RTTCommonDecoderOpts[];
}

export interface ElfSection {
    name: string;
    address: number;            // New base address
    addressOrig: number;        // original base address in Elf file
}
export interface SymbolFile {
    file: string;
    offset?: number;
    textaddress?: number;
    sections: ElfSection[];
    sectionMap: {[name: string]: ElfSection};
}

// Helper function to create a symbolFile object properly with required elements
export function defSymbolFile(file: string): SymbolFile {
    const ret: SymbolFile = {
        file: file,
        sections: [],
        sectionMap: {}
    };
    return ret;
}

export interface DisassemblyInstruction {
    address: string;
    functionName: string;
    offset: number;
    instruction: string;
    opcodes: string;
}

export enum CTIAction {
    'init',
    'pause',
    'resume'
}

export function calculatePortMask(decoders: any[]) {
    if (!decoders) { return 0; }

    let mask: number = 0;
    decoders.forEach((d) => {
        if (d.type === 'advanced') {
            for (const port of d.ports) {
                mask = (mask | (1 << port)) >>> 0;
            }
        }
        else {
            mask = (mask | (1 << d.port)) >>> 0;
        }
    });
    return mask;
}

export function createPortName(procNum: number, prefix: string = 'gdbPort'): string {
    return prefix + ((procNum === 0) ? '' : procNum.toString());
}

export function parseHexOrDecInt(str: string): number {
    return str.startsWith('0x') ? parseInt(str.substring(2), 16) : parseInt(str, 10);
}

export function toStringDecHexOctBin(val: number/* should be an integer*/): string {
    if (Number.isNaN(val)) {
        return 'NaN: Not a number';
    }
    if (!Number.isSafeInteger(val)) {
        // TODO: Handle big nums. We eventually have to. We need to use bigint as javascript
        // looses precision beyond 53 bits
        return 'Big Num: ' + val.toString() + '\nother-radix values not yet available. Sorry';
    }

    let ret = `dec: ${val}`;
    if (val < 0) {
        val = -val;
        val = (~(val >>> 0) + 1) >>> 0;
    }
    let str = val.toString(16);
    str = '0x' + '0'.repeat(Math.max(0, 8 - str.length)) + str;
    ret += `\nhex: ${str}`;

    str = val.toString(8);
    str = '0'.repeat(Math.max(0, 12 - str.length)) + str;
    ret += `\noct: ${str}`;

    str = val.toString(2);
    str = '0'.repeat(Math.max(0, 32 - str.length)) + str;
    let tmp = '';
    while (true) {
        if (str.length <= 8) {
            tmp = str + tmp;
            break;
        }
        tmp = ' ' + str.slice(-8) + tmp;
        str = str.slice(0, -8);
    }
    ret += `\nbin: ${tmp}`;
    return ret ;
}

export function parseHostPort(hostPort: string) {
    let port: number;
    let host = '127.0.0.1';
    const match = hostPort.match(/(.*)\:([0-9]+)/);
    if (match) {
        host = match[1] ? match[1] : host;
        port = parseInt(match[2], 10);
    } else {
        if (hostPort.startsWith(':')) {
            hostPort = hostPort.slice(1);
        }
        port = parseInt(hostPort, 10);
    }
    return { port: port, host: host };
}

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class HrTimer {
    private start: bigint;
    constructor() {
        this.start = process.hrtime.bigint();
    }

    public restart(): void {
        this.start = process.hrtime.bigint();
    }

    public getStart(): bigint {
        return this.start;
    }

    public deltaNs(): string {
        return (process.hrtime.bigint() - this.start).toString();
    }

    public deltaUs(): string {
        return this.toStringWithRes(3);
    }

    public deltaMs(): string {
        return this.toStringWithRes(6);
    }

    public createPaddedMs(padding: number): string {
        const hrUs = this.deltaMs().padStart(padding, '0');
        // const hrUsPadded = (hrUs.length < padding) ? '0'.repeat(padding - hrUs.length) + hrUs : '' + hrUs ;
        // return hrUsPadded;
        return hrUs;
    }

    public createDateTimestamp(): string {
        const hrUs = this.createPaddedMs(6);
        const date = new Date();
        const ret = `[${date.toISOString()}, +${hrUs}ms]`;
        return ret;
    }

    private toStringWithRes(res: number) {
        const diff = process.hrtime.bigint() - this.start + BigInt((10 ** res) / 2);
        let ret = diff.toString();
        ret = ret.length <= res ? '0' : ret.substr(0, ret.length - res);
        return ret;
    }
}

// This is not very precise. It is for seeing if the string has any special characters
// where will need to put the string in quotes as a precaution. This is more a printing
// aid rather an using for an API
export function quoteShellAndCmdChars(s): string {
    const quote = /[\s\"\*\[\]!@#$%^&*\(\)\\:]/g.test(s) ? '"' : '';
    s = s.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
    return quote + s.replace(/"/g, '\\"') + quote;
}

export function quoteShellCmdLine(list: string[]): string {
    return list.map((s) => quoteShellAndCmdChars(s)).join(' ');
}
