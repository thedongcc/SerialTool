import { Segment, Token, CRCConfig, FlagConfig } from '../types/token';
import { calculateCRC, sliceData } from './crc';

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
                const type = el.getAttribute('data-token-type');

                if (type === 'hex') {
                    // Recursive parsing for container token
                    const children = parseDOM(el); // Helper needs to return Segments
                    // Note: parseDOM calls itself.
                    segments.push({
                        id,
                        type: 'token',
                        content: { id, type: 'hex' } as any,
                        children // Attach children
                    });
                } else {
                    segments.push({ id, type: 'token', content: { id } as any });
                }
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
            if (!token) continue;

            if (token.type === 'crc') {
                const config = token.config as CRCConfig;

                // Flatten current buffer to handle offsets correctly
                const currentBuf = new Uint8Array(currentTotalLength);
                let offset = 0;
                for (const p of parts) {
                    currentBuf.set(p, offset);
                    offset += p.length;
                }

                // Determine Insertion/Split Point based on endIndex (0, -1, -2...)
                const offsetParam = config.endIndex || 0;
                let splitIdx = currentBuf.length;
                if (offsetParam < 0) {
                    splitIdx = Math.max(0, currentBuf.length + offsetParam);
                }

                // Head is what we checksum (subject to startIndex validation)
                const head = currentBuf.slice(0, splitIdx);
                const tail = currentBuf.slice(splitIdx);

                // Calculate CRC on the Head
                // sliceData handles startIndex and 0 (End) logic
                const dataToCheck = sliceData(head, config.startIndex || 0, 0);
                const crcBytes = calculateCRC(dataToCheck, config.algorithm);

                // Re-assemble parts: [Head, CRC, Tail]
                parts.length = 0;
                if (head.length > 0) parts.push(head);
                parts.push(crcBytes);
                if (tail.length > 0) parts.push(tail);

                currentTotalLength = head.length + crcBytes.length + tail.length;

            } else if (token.type === 'flag') {
                const config = token.config as FlagConfig;
                const bytes = parseHex(config.hex || '');
                parts.push(bytes);
                currentTotalLength += bytes.length;
            } else if (token.type === 'hex' && segment.children) {
                // Hex Container
                // 1. Recursive Compilation
                // Note: Inner tokens are looked up in the SAME global tokens map (flattened by TipTap)
                const innerBytes = compileSegments(segment.children, mode, tokens);

                // 2. Resize
                const config = token.config as any; // Cast to HexConfig
                const targetWidth = config.byteWidth || 1;

                // Resize Logic:
                // Pad Left with 0s if smaller.
                // Keep LSB (Truncate Left) if larger. 
                // E.g. [0x19, 0xBB] -> Width 1 -> [0xBB]
                // [0x05] -> Width 3 -> [0x00, 0x00, 0x05]
                const finalBytes = new Uint8Array(targetWidth);

                if (innerBytes.length >= targetWidth) {
                    // Take last N bytes
                    finalBytes.set(innerBytes.slice(innerBytes.length - targetWidth));
                } else {
                    // Pad left (default 0 init) -> set at offset
                    // [0, 0, 0] <-- [0x05] (len 1). Offset = 3-1 = 2.
                    finalBytes.set(innerBytes, targetWidth - innerBytes.length);
                }

                parts.push(finalBytes);
                currentTotalLength += finalBytes.length;
            }
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
