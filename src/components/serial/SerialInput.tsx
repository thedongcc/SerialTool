import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Plus, Settings, ChevronDown, AlignLeft } from 'lucide-react';
import { Token, CRCConfig } from '../../types/token';
import { TokenConfigPopover } from './TokenConfigPopover';
import { parseDOM, compileSegments } from '../../utils/InputParser';

interface SerialInputProps {
    onSend: (data: string | Uint8Array, mode: 'text' | 'hex') => void;
}

export const SerialInput = ({ onSend }: SerialInputProps) => {
    const [mode, setMode] = useState<'text' | 'hex'>('text');
    const [lineEnding, setLineEnding] = useState<'' | '\n' | '\r' | '\r\n'>('\r\n');
    const [tokens, setTokens] = useState<Record<string, Token>>({});
    const [popover, setPopover] = useState<{ id: string, x: number, y: number } | null>(null);
    const inputRef = useRef<HTMLDivElement>(null);
    const [hasContent, setHasContent] = useState(false);

    // Sync input handling
    const handleInput = () => {
        if (inputRef.current) {
            setHasContent(inputRef.current.innerText.trim().length > 0 || inputRef.current.querySelector('[data-token-id]') !== null);
        }
    };

    const handleSend = () => {
        if (!inputRef.current) return;

        const segments = parseDOM(inputRef.current);
        let data = compileSegments(segments, mode, tokens);

        if (data.length === 0) return;

        // Append line ending if applicable
        if (lineEnding && mode === 'text') {
            if (typeof data === 'string') {
                data += lineEnding;
            } else if (data instanceof Uint8Array) {
                // If it was compiled to Uint8Array (e.g. valid tokens were present), append line ending bytes
                const encoder = new TextEncoder();
                const leBytes = encoder.encode(lineEnding);
                const newData = new Uint8Array(data.length + leBytes.length);
                newData.set(data);
                newData.set(leBytes, data.length);
                data = newData;
            }
        }

        // Send data with current mode
        onSend(data, mode);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const insertToken = (type: 'crc') => {
        const id = `token-${Date.now()}`;
        const newToken: Token = {
            id,
            type: 'crc',
            config: {
                algorithm: 'modbus-crc16',
                startIndex: 0,
                length: 0
            }
        };

        setTokens(prev => ({ ...prev, [id]: newToken }));
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.setAttribute('data-token-id', id);
        // Styled like a pill
        span.className = 'mx-1 px-1.5 py-0.5 bg-[#4ec9b0]/20 text-[#4ec9b0] text-[11px] rounded cursor-pointer hover:bg-[#4ec9b0]/30 select-none whitespace-nowrap inline-flex items-center align-middle my-0.5 border border-transparent hover:border-[#4ec9b0]/50';
        span.innerText = '[CRC]';
        span.onclick = (e) => {
            e.stopPropagation();
            const rect = span.getBoundingClientRect();
            setPopover({ id, x: rect.left, y: rect.bottom });
        };

        if (inputRef.current) {
            inputRef.current.focus();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && inputRef.current.contains(sel.anchorNode)) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(span);
                range.setStartAfter(span);
                range.setEndAfter(span);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                inputRef.current.appendChild(span);
            }
            handleInput();
        }
    };

    const updateTokenConfig = (id: string, newConfig: any) => {
        setTokens(prev => ({ ...prev, [id]: { ...prev[id], config: newConfig } }));
    };

    const deleteToken = (id: string) => {
        if (inputRef.current) {
            const el = inputRef.current.querySelector(`[data-token-id="${id}"]`);
            if (el) el.remove();
        }
        const newTokens = { ...tokens };
        delete newTokens[id];
        setTokens(newTokens);
    };

    return (
        <div className="border-t border-[var(--vscode-border)] bg-[#252526] p-2 flex flex-col gap-2 shrink-0 select-none">
            {/* Top Toolbar */}
            <div className="flex items-center gap-2">
                <button
                    className="flex items-center gap-1 text-[11px] text-[#969696] hover:text-[var(--vscode-fg)] transition-colors"
                    onClick={() => insertToken('crc')}
                >
                    <Plus size={12} /> Insert CRC
                </button>
                <div className="w-[1px] h-3 bg-[#3c3c3c]"></div>

                {mode === 'text' && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#969696]">Ending:</span>
                        <select
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1 py-0.5 max-w-[80px]"
                            value={lineEnding}
                            onChange={(e) => setLineEnding(e.target.value as any)}
                        >
                            <option value="">None</option>
                            <option value="\n">LF</option>
                            <option value="\r">CR</option>
                            <option value="\r\n">CRLF</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Main Input Row */}
            <div className="flex gap-2 min-h-[70px]">
                {/* Format Selector Column */}
                <div className="flex flex-col gap-1 w-12 shrink-0">
                    <div className="flex flex-col gap-0.5 bg-[#1e1e1e] rounded p-0.5 border border-[#3c3c3c]">
                        <div
                            className={`text-[10px] text-center cursor-pointer py-1 rounded-sm uppercase ${mode === 'text' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:bg-[#333]'}`}
                            onClick={() => setMode('text')}
                        >TXT</div>
                        <div
                            className={`text-[10px] text-center cursor-pointer py-1 rounded-sm uppercase ${mode === 'hex' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:bg-[#333]'}`}
                            onClick={() => setMode('hex')}
                        >HEX</div>
                    </div>
                </div>

                {/* Rich Input Area */}
                <div
                    className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm focus-within:border-[var(--vscode-focusBorder)] cursor-text p-2 overflow-hidden flex flex-col"
                    onClick={() => inputRef.current?.focus()}
                >
                    <div
                        ref={inputRef}
                        contentEditable
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        className="outline-none text-[#cccccc] text-[12px] font-mono whitespace-pre-wrap break-all flex-1 min-h-[40px] overflow-y-auto custom-scrollbar"
                        role="textbox"
                        spellCheck={false}
                    />
                </div>

                {/* Send Button */}
                <button
                    className={`w-14 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${hasContent ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white' : 'bg-[#2d2d2d] text-[#666] cursor-not-allowed'}`}
                    onClick={handleSend}
                    disabled={!hasContent}
                >
                    <Send size={16} />
                    <span className="text-[10px] font-medium">Send</span>
                </button>
            </div>

            {popover && tokens[popover.id] && (
                <TokenConfigPopover
                    token={tokens[popover.id]}
                    onUpdate={updateTokenConfig}
                    onDelete={deleteToken}
                    onClose={() => setPopover(null)}
                    position={{ x: popover.x, y: popover.y }}
                />
            )}
        </div>
    );
};
