export interface CRCConfig {
    enabled: boolean;
    algorithm: 'modbus-crc16' | 'ccitt-crc16' | 'crc32' | 'none';
    startIndex: number;
    endIndex: number;
}

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

export const sliceData = (data: Uint8Array, start: number, end: number): Uint8Array => {
    const actualStart = start < 0 ? data.length + start : start;
    const actualEnd = end <= 0 ? data.length + end : end;

    if (actualStart < 0 || actualEnd > data.length || actualStart >= actualEnd) {
        return new Uint8Array(0);
    }

    return data.slice(actualStart, actualEnd);
};

export const applyTXCRC = (data: Uint8Array, config: CRCConfig): Uint8Array => {
    if (!config.enabled || config.algorithm === 'none') return data;

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

    const content = data.slice(0, data.length - crcLen);
    const receivedCRC = data.slice(data.length - crcLen);

    const targetData = sliceData(content, config.startIndex, config.endIndex);
    if (targetData.length === 0) return false;

    const expectedCRC = calculateCRC(targetData, config.algorithm);

    if (expectedCRC.length !== receivedCRC.length) return false;
    for (let i = 0; i < expectedCRC.length; i++) {
        if (expectedCRC[i] !== receivedCRC[i]) return false;
    }

    return true;
};
