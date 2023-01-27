export class AddrRange {
    constructor(public base: number, public length: number) {
    }

    /** return next address after this addr. range */
    public nxtAddr(): number {
        return this.base + this.length;
    }

    /** return last address in this range */
    public endAddr(): number {
        return this.nxtAddr() - 1;
    }
}

export class AddressRangesUtils {
    /**
     * Returns a set of address ranges that have 0 < length <= maxBytes
     *
     * @param ranges array of ranges to check an split
     * @param maxBytes limit of each range
     * @param dbgMsg To output debug messages -- name of address space
     * @param dbgLen To output debug messages -- total length of addr space
     */
    public static splitIntoChunks(ranges: AddrRange[], maxBytes: number, _dbgMsg = '', _dbgLen = 0): AddrRange[] {
        const newRanges = new Array<AddrRange>();
        for (const r of ranges) {
            while (r.length > maxBytes) {
                newRanges.push(new AddrRange(r.base, maxBytes));
                r.base += maxBytes;
                r.length -= maxBytes;
            }
            if (r.length > 0) {     // Watch out, can be negative
                newRanges.push(r);
            }
        }
        return newRanges;
    }
}
