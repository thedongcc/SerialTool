import { Segment, Token, CRCConfig } from '../types/token';
import { calculateCRC } from './crc';

export const parseDOM = (root: HTMLElement): Segment[] => {
    const segments: Segment[] = [];

    // Flatten child nodes helper
    const traverse = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text) {
                // If previous segment was text, merge? No, simple is fine.
                // Actually merging might be better for hex parsing.
                if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
                    segments[segments.length - 1].content += text;
                } else {
                    segments.push({ id: `text-${Date.now()}-${Math.random()}`, type: 'text', content: text });
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.hasAttribute('data-token-id')) {
                const id = el.getAttribute('data-token-id')!;
                segments.push({ id, type: 'token', content: { id } as any }); // Content isn't fully needed here, just ID ref
            } else {
                // Traverse children
                el.childNodes.forEach(traverse);
            }
        }
    };

    root.childNodes.forEach(traverse);
    return segments;
};

export const parseHex = (text: string): Uint8Array => {
    const clean = text.replace(/[^0-9A-Fa-f]/g, '');
    if (clean.length % 2 !== 0) {
        // Handle odd length? Pad? Or return error?
        // Let's assume validation happens elsewhere or we just ignore last nibble
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
};

export const compileSegments = (
    segments: Segment[],
    mode: 'text' | 'hex',
    tokens: Record<string, Token>
): Uint8Array => {
    // 1. Build intermediate list of byte arrays
    const parts: Uint8Array[] = [];
    let currentTotalLength = 0;

    for (const segment of segments) {
        if (segment.type === 'text') {
            const text = segment.content as string;
            let bytes: Uint8Array;
            if (mode === 'hex') {
                bytes = parseHex(text);
            } else {
                bytes = new TextEncoder().encode(text);
            }
            if (bytes.length > 0) {
                parts.push(bytes);
                currentTotalLength += bytes.length;
            }
        } else if (segment.type === 'token') {
            const tokenId = segment.id;
            const token = tokens[tokenId];
            if (!token) continue; // Should not happen

            if (token.type === 'crc') {
                const config = token.config as CRCConfig;

                // Assemble current buffer to calculate CRC
                const currentBuf = new Uint8Array(currentTotalLength);
                let offset = 0;
                for (const p of parts) {
                    currentBuf.set(p, offset);
                    offset += p.length;
                }

                // Determine range
                let start = config.startIndex;
                let end = config.length === 0 ? currentBuf.length : start + config.length;

                // Bounds check
                if (start < 0) start = 0;
                if (end > currentBuf.length) end = currentBuf.length;
                if (start >= end) {
                    // Empty range, maybe 0 bytes CRC or default?
                    // Let's append 0 bytes
                    continue;
                }

                const dataToCheck = currentBuf.slice(start, end);
                const crcBytes = calculateCRC(dataToCheck, config.algorithm);

                parts.push(crcBytes);
                currentTotalLength += crcBytes.length;
            }
            // Add other token types here (e.g. AutoInc)
        }
    }

    // Combined result
    const result = new Uint8Array(currentTotalLength);
    let offset = 0;
    for (const p of parts) {
        result.set(p, offset);
        offset += p.length;
    }
    return result;
};
