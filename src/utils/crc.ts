export interface CRCConfig {
    enabled: boolean;
    algorithm: 'modbus-crc16' | 'ccitt-crc16' | 'crc32' | 'none';
    startIndex: number;
    endIndex: number;
}

// ... (algorithms unchanged)

export const sliceData = (data: Uint8Array, start: number, end: number): Uint8Array => {
    const actualStart = start < 0 ? data.length + start : start;
    if (actualStart < 0 || actualStart >= data.length) return new Uint8Array(0);

    // Logic: -1 means "End" (include all). 
    // -2 means "End - 1 byte" (exclude last 1 byte)
    // -3 means "End - 2 bytes" (exclude last 2 bytes)
    // If end >= 0, it means absolute index (exclusive? or length?)
    // User interface is "Start" and "End". 
    // Usually Start=0, End=2 means 0, 1. (Length 2).
    // But "End" usually implies "Index of end".
    // Let's assume positive end is *Length*? Or Index?
    // Given the previous code used `config.length`, and now we use `endIndex`.
    // The user options are -1, -2, -3.
    // If user provides positive number (e.g. from parsing), how to enable?
    // Since UI only gives -1, -2, -3 (dropdown), we focus on those.
    // If we want positive length, we might need another mode.
    // But based on user request "Select -1 -2 -3", I will implement that.

    let actualEnd = data.length;
    if (end === -1) {
        actualEnd = data.length;
    } else if (end < -1) {
        actualEnd = data.length + (end + 1); // -2 -> len - 1
    } else {
        // Positive value: treat as absolute index (exclusive) or length?
        // Let's treat as Length for backward compat if any, or just absolute index.
        // Assuming Length for positive is easier.
        // But the field is called "endIndex".
        // Let's treat it as Length if positive?
        // "默认为End(末尾),可选-1 -2 -3".
        // I'll stick to negative logic. For positive, I'll treat as length for now.
        actualEnd = start + end;
    }

    return data.slice(actualStart, Math.max(actualStart, actualEnd));
};

/**
 * CRC16 Modbus (Polynomial: 0x8005, Seed: 0xFFFF, Little Endian)
 */
function crc16modbus(data: Uint8Array): number {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc & 0xFFFF;
}

/**
 * CRC16 CCITT (Polynomial: 0x1021, Seed: 0xFFFF, Big Endian)
 */
function crc16ccitt(data: Uint8Array): number {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= (data[i] << 8);
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc & 0xFFFF;
}

/**
 * CRC32 (Standard IEEE 802.3 polynomial: 0xEDB88320)
 */
let crc32Table: Uint32Array | null = null;
function makeCRC32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[i] = c;
    }
    return table;
}

function crc32(data: Uint8Array): number {
    if (!crc32Table) crc32Table = makeCRC32Table();
    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

export const calculateCRC = (data: Uint8Array, algorithm: CRCConfig['algorithm']): Uint8Array => {
    switch (algorithm) {
        case 'modbus-crc16': {
            const val = crc16modbus(data);
            const buf = new Uint8Array(2);
            // Modbus is LSB first
            buf[0] = val & 0xFF;
            buf[1] = (val >> 8) & 0xFF;
            return buf;
        }
        case 'ccitt-crc16': {
            const val = crc16ccitt(data);
            const buf = new Uint8Array(2);
            // CCITT is MSB first
            buf[0] = (val >> 8) & 0xFF;
            buf[1] = val & 0xFF;
            return buf;
        }
        case 'crc32': {
            const val = crc32(data);
            const buf = new Uint8Array(4);
            // CRC32 is usually MSB first
            buf[0] = (val >> 24) & 0xFF;
            buf[1] = (val >> 16) & 0xFF;
            buf[2] = (val >> 8) & 0xFF;
            buf[3] = val & 0xFF;
            return buf;
        }
        default:
            return new Uint8Array(0);
    }
};



export const applyTXCRC = (data: Uint8Array, config: CRCConfig): Uint8Array => {
    if (!config.enabled || config.algorithm === 'none') return data;

    // For TX, usually length 0 means "Everything before this token". 
    // But since this function receives the *whole* data (without tokens separatively processed here usually, wait),
    // Actually applyTXCRC is called with `rawData`. 
    // If we assume manual "startIndex" and "length", we checksum that part and append CRC at END.

    const targetData = sliceData(data, config.startIndex, config.endIndex);
    if (targetData.length === 0) return data;

    const crcValue = calculateCRC(targetData, config.algorithm);
    const result = new Uint8Array(data.length + crcValue.length);
    result.set(data);
    result.set(crcValue, data.length);
    return result;
};

export const validateRXCRC = (data: Uint8Array, config: CRCConfig): boolean => {
    if (!config.enabled || config.algorithm === 'none') return true;

    let crcLen = 0;
    if (config.algorithm.includes('crc16')) crcLen = 2;
    else if (config.algorithm === 'crc32') crcLen = 4;

    if (data.length <= crcLen) return false;

    // The logic: 
    // 1. Separate presumed CRC at end (or wherever?)
    //    Usually RX val checks if the LAST bytes match the CRC of the PRECEDING bytes.
    //    Or user might specify "Start=0, Length=N" and expects CRC to be at N (or N+1..)?
    //    Standard generic RX checker usually assumes CRC is at the END of the packet.

    const content = data.slice(0, data.length - crcLen);
    const receivedCRC = data.slice(data.length - crcLen);

    // If config.length is 0, we check "All content".
    // If config.length is > 0, we check only that subset, but then compare against what? The END of the whole packet?
    // Or does the user mean "The packet is Start+Length+CRC"?
    // The current UI binds RX check to the *received data chunk*.
    // If we receive "A B C CRC", and configure Start=0, Length=0 -> Check A B C.

    // We pass `content` (data - crc) to sliceData.
    // effective length = config.length === 0 ? content.length : config.length.
    const targetData = sliceData(content, config.startIndex, config.endIndex);

    if (targetData.length === 0) return false;

    const expectedCRC = calculateCRC(targetData, config.algorithm);

    if (expectedCRC.length !== receivedCRC.length) return false;
    for (let i = 0; i < expectedCRC.length; i++) {
        if (expectedCRC[i] !== receivedCRC[i]) return false;
    }

    return true;
};
