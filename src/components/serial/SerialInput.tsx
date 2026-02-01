import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Plus, Upload, Timer, Flag } from 'lucide-react';
import { Token, CRCConfig, FlagConfig } from '../../types/token';
import { TokenConfigPopover } from './TokenConfigPopover';
import { parseDOM, compileSegments } from '../../utils/InputParser';

interface SerialInputProps {
    onSend: (data: string | Uint8Array, mode: 'text' | 'hex') => void;
    initialContent?: string;
    initialHTML?: string;
    initialTokens?: Record<string, Token>;
    initialMode?: 'text' | 'hex';
    initialLineEnding?: '' | '\n' | '\r' | '\r\n';
    isConnected?: boolean;
    onConnectRequest?: () => void;
    onStateChange?: (state: { content: string, html: string, tokens: Record<string, Token>, mode: 'text' | 'hex', lineEnding: '' | '\n' | '\r' | '\r\n' }) => void;
}

export const SerialInput = ({
    onSend,
    initialContent = '',
    initialHTML = '',
    initialTokens = {},
    initialMode = 'hex',
    initialLineEnding = '\r\n',
    isConnected = false,
    onConnectRequest,
    onStateChange
}: SerialInputProps) => {
    const [mode, setMode] = useState<'text' | 'hex'>(initialMode);
    const [lineEnding, setLineEnding] = useState<'' | '\n' | '\r' | '\r\n'>(initialLineEnding);
    const [tokens, setTokens] = useState<Record<string, Token>>(initialTokens);
    const [popover, setPopover] = useState<{ id: string; x: number; y: number } | null>(null);
    const [nextTokenId, setNextTokenId] = useState(0);
    const [timerEnabled, setTimerEnabled] = useState(false);
    const [timerInterval, setTimerInterval] = useState(1000);
    const inputRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const hasContent = inputRef.current?.innerText.trim().length ?? 0 > 0;
    const initializedRef = useRef(false);

    // Restore initial content
    // Sync initialTokens when they change
    // Sync initialTokens when they change
    useEffect(() => {
        console.log('[SerialInput] initialTokens sync:', initialTokens);
        setTokens(initialTokens || {});
    }, [initialTokens]);

    // Restore initial content
    useEffect(() => {
        if (inputRef.current && !initializedRef.current) {
            if (initialHTML) {
                inputRef.current.innerHTML = initialHTML;
                // Re-bind token click events because innerHTML destroys event listeners
                const spans = inputRef.current.querySelectorAll('span[data-token-id]');
                spans.forEach(span => {
                    (span as HTMLElement).onclick = (e) => {
                        e.stopPropagation();
                        const id = span.getAttribute('data-token-id')!;
                        const rect = span.getBoundingClientRect();
                        setPopover({ id, x: rect.left, y: rect.bottom });
                    };
                });
            } else if (initialContent) {
                inputRef.current.innerText = initialContent;
            }
            initializedRef.current = true;
        }
    }, [initialContent, initialHTML]);

    const notifyStateChange = (newTokens?: Record<string, Token>, newMode?: 'text' | 'hex', newLineEnding?: any) => {
        if (onStateChange && inputRef.current) {
            onStateChange({
                content: inputRef.current.innerText,
                html: inputRef.current.innerHTML, // Save HTML for tokens
                tokens: newTokens || tokens,
                mode: newMode || mode,
                lineEnding: newLineEnding !== undefined ? newLineEnding : lineEnding
            });
        }
    };

    // Sync input handling and cleanup tokens
    const handleInput = () => {
        if (inputRef.current) {
            // Check for deleted tokens and remove from state
            const currentIds = new Set(
                Array.from(inputRef.current.querySelectorAll('[data-token-id]'))
                    .map(el => el.getAttribute('data-token-id'))
            );

            let nextTokens = { ...tokens };
            let changed = false;

            // We iterate over the *current state* tokens (from closure - might be stale but handleInput usually runs in effect or event).
            // Actually 'tokens' here is from render.
            // If we deleted multiple, this works.
            Object.keys(nextTokens).forEach(key => {
                if (!currentIds.has(key)) {
                    delete nextTokens[key];
                    changed = true;
                }
            });

            if (changed) {
                setTokens(nextTokens);
                notifyStateChange(nextTokens);
            } else {
                notifyStateChange(); // Just content/html changed
            }
        }
    };

    const handleSend = () => {
        if (!isConnected && onConnectRequest) {
            onConnectRequest();
            return;
        }

        if (!inputRef.current) return;

        console.log('[SerialInput] handleSend tokens:', tokens);

        const segments = parseDOM(inputRef.current);
        let data = compileSegments(segments, mode, tokens);

        if (data.length === 0) return;

        // Append line ending if applicable
        const shouldAddLineEnding = mode === 'text' && lineEnding;
        if (shouldAddLineEnding) {
            const ending = lineEnding;
            if (typeof data === 'string') {
                data += ending;
            } else if (data instanceof Uint8Array) {
                // If it was compiled to Uint8Array (e.g. valid tokens were present), append line ending bytes
                const encoder = new TextEncoder();
                const leBytes = encoder.encode(ending!);
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

    // Timer logic - must be after handleSend definition
    useEffect(() => {
        if (timerEnabled && hasContent) {
            timerRef.current = setInterval(() => {
                handleSend();
            }, timerInterval);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [timerEnabled, timerInterval, hasContent]);

    const handleFileUpload = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e: Event) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                const data = new Uint8Array(arrayBuffer);
                onSend(data, mode);
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    };

    const insertToken = (type: 'crc' | 'flag') => {
        const id = `token-${Date.now()}`;
        const newToken: Token = {
            id,
            type,
            config: type === 'crc' ? {
                algorithm: 'modbus-crc16',
                startIndex: 0,
                endIndex: -1
            } : {
                hex: 'AA' // Default
            } as FlagConfig
        };

        if (inputRef.current) {
            const span = document.createElement('span');
            span.contentEditable = 'false';
            span.setAttribute('data-token-id', id);
            span.className = 'inline-block bg-[#3c3c3c] text-[#569cd6] px-1 rounded mx-0.5 cursor-pointer select-none text-[11px] font-mono align-middle';

            if (type === 'crc') {
                span.innerText = '[Modbus-L8] [Modbus-H8]';
            } else {
                span.innerText = '[Flag AA]';
            }

            span.onclick = (e) => {
                e.stopPropagation();
                const rect = span.getBoundingClientRect();
                setPopover({ id, x: rect.left, y: rect.bottom });
            };

            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && inputRef.current.contains(sel.anchorNode)) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(span);
                range.setStartAfter(span);
                range.setEndAfter(span);
            } else {
                inputRef.current.appendChild(span);
            }

            // Trigger input event manually to sync state
            handleInput();
        }

        const newTokens = { ...tokens, [id]: newToken };
        setTokens(newTokens);
        notifyStateChange(newTokens);
    };

    const updateTokenConfig = (id: string, newConfig: any) => {
        setTokens(prev => {
            const token = prev[id];
            if (token) {
                // Update DOM label
                if (inputRef.current) {
                    const el = inputRef.current.querySelector(`[data-token-id="${id}"]`) as HTMLElement;
                    if (el) {
                        if (token.type === 'crc') {
                            let label = '[CRC]';
                            switch (newConfig.algorithm) {
                                case 'modbus-crc16': label = '[Modbus-L8] [Modbus-H8]'; break;
                                case 'ccitt-crc16': label = '[CCITT-H8] [CCITT-L8]'; break;
                                case 'crc32': label = '[CRC32]'; break;
                            }
                            el.innerText = label;
                        } else if (token.type === 'flag') {
                            const hex = (newConfig as FlagConfig).hex || '';
                            // Truncate if too long
                            const display = hex.length > 12 ? hex.substring(0, 12) + '...' : hex;
                            el.innerText = hex ? `[Flag ${display}]` : '[Flag]';
                        }
                    }
                }
            }
            return { ...prev, [id]: { ...prev[id], config: newConfig } };
        });

        const updatedTokens = { ...tokens, [id]: { ...tokens[id], config: newConfig } };
        notifyStateChange(updatedTokens);
    };

    const deleteToken = (id: string) => {
        if (inputRef.current) {
            const el = inputRef.current.querySelector(`[data-token-id="${id}"]`);
            if (el) el.remove();
        }
        const newTokens = { ...tokens };
        delete newTokens[id];
        setTokens(newTokens);
        notifyStateChange(newTokens);
    };

    return (
        <div className="border-t border-[var(--vscode-border)] bg-[#252526] p-2 flex flex-col gap-2 shrink-0 select-none">
            {/* Top Toolbar */}
            <div className="flex items-center gap-2 h-6">
                <button
                    className="flex items-center gap-1 text-[11px] text-[#969696] hover:text-[var(--vscode-fg)] transition-colors"
                    onClick={() => insertToken('crc')}
                >
                    <Plus size={12} /> Insert CRC
                </button>
                <div className="w-[1px] h-3 bg-[#3c3c3c]"></div>

                <button
                    className="flex items-center gap-1 text-[11px] text-[#969696] hover:text-[var(--vscode-fg)] transition-colors"
                    onClick={() => insertToken('flag')}
                >
                    <Flag size={12} /> Add Flag
                </button>
                <div className="w-[1px] h-3 bg-[#3c3c3c]"></div>

                {/* File Upload */}
                <button
                    className="flex items-center gap-1 text-[11px] text-[#969696] hover:text-[var(--vscode-fg)] transition-colors"
                    onClick={handleFileUpload}
                    title="Send File"
                >
                    <Upload size={12} /> File
                </button>
                <div className="w-[1px] h-3 bg-[#3c3c3c]"></div>

                {/* Timer Controls */}
                <div className="flex items-center gap-1">
                    <label className="flex items-center gap-1 text-[11px] text-[#969696] hover:text-[var(--vscode-fg)] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={timerEnabled}
                            onChange={(e) => setTimerEnabled(e.target.checked)}
                            className="w-3 h-3"
                        />
                        <Timer size={12} />
                        Timer
                    </label>
                    {timerEnabled && (
                        <input
                            type="number"
                            min="100"
                            step="100"
                            value={timerInterval}
                            onChange={(e) => setTimerInterval(Math.max(100, parseInt(e.target.value) || 1000))}
                            className="w-16 bg-[#3c3c3c] text-[11px] text-[#cccccc] px-1 py-0.5 rounded-sm outline-none"
                            placeholder="ms"
                        />
                    )}
                </div>

                {mode === 'text' && (
                    <>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-[#969696]">Ending:</span>
                            <select
                                className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1 py-0.5 max-w-[80px]"
                                value={lineEnding}
                                onChange={(e) => {
                                    const val = e.target.value as any;
                                    setLineEnding(val);
                                    notifyStateChange(undefined, undefined, val);
                                }}
                            >
                                <option value="">None</option>
                                <option value="\n">LF</option>
                                <option value="\r">CR</option>
                                <option value="\r\n">CRLF</option>
                            </select>
                        </div>
                    </>
                )}
            </div>

            {/* Main Input Row */}
            <div className="flex gap-2">
                {/* Format Selector Column */}
                <div className="flex flex-col gap-1 w-12 shrink-0">
                    <div className="flex flex-col gap-0.5 bg-[#1e1e1e] rounded p-0.5 border border-[#3c3c3c]">
                        <div
                            className={`text-[10px] text-center cursor-pointer py-1 rounded-sm uppercase ${mode === 'text' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:bg-[#333]'}`}
                            onClick={() => {
                                setMode('text');
                                notifyStateChange(undefined, 'text');
                            }}
                        >TXT</div>
                        <div
                            className={`text-[10px] text-center cursor-pointer py-1 rounded-sm uppercase ${mode === 'hex' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:bg-[#333]'}`}
                            onClick={() => {
                                setMode('hex');
                                notifyStateChange(undefined, 'hex');
                            }}
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
                        onBlur={() => {
                            if (mode === 'hex' && inputRef.current) {
                                // Simple auto-format for text nodes
                                // We strictly format text nodes to "XX XX XX" format
                                const walk = (node: Node) => {
                                    if (node.nodeType === Node.TEXT_NODE) {
                                        const text = node.textContent || '';
                                        // Remove all whitespace
                                        const clean = text.replace(/\s+/g, '').replace(/[^0-9A-Fa-f]/g, ''); // Also strip invalid chars? Or just spaces?
                                        // User said "add space". Let's clean up valid hex too.
                                        // Strip non-hex?
                                        // "If hex format..." usually implies restricting to hex.
                                        // But users might type comments? Token parser separates blocks.
                                        // Let's safe-guard: only strip spaces, format chunks of 2.
                                        // But if I have "Hello", it becomes "He ll ..."?
                                        // I'll stick to: Strip spaces, split 2.
                                        // But if user typed non-hex, it will look weird.
                                        // parseHex cleans it anyway.
                                        // I'll format hex-like chars.
                                        if (clean.length > 0) {
                                            const formatted = clean.match(/.{1,2}/g)?.join(' ') || clean;
                                            if (formatted !== text) {
                                                node.textContent = formatted;
                                            }
                                        }
                                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                                        const el = node as HTMLElement;
                                        if (el.hasAttribute('data-token-id')) return; // Do not touch tokens
                                        node.childNodes.forEach(walk);
                                    }
                                };
                                walk(inputRef.current);
                            }
                        }}
                        className="outline-none text-[#cccccc] text-[12px] font-mono whitespace-pre-wrap break-all flex-1 min-h-[40px] overflow-y-auto custom-scrollbar"
                        role="textbox"
                        spellCheck={false}
                    />
                </div>

                {/* Send Button */}
                {/* Send Button */}
                <button
                    className={`w-14 flex flex-col items-center justify-center gap-1 rounded-sm transition-colors ${isConnected
                        ? (hasContent ? 'bg-[#0e639c] hover:bg-[#1177bb] text-white' : 'bg-[#2d2d2d] text-[#666] cursor-not-allowed')
                        : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#3d3d3d] cursor-pointer border border-[#3c3c3c] hover:border-[#cccccc]'
                        }`}
                    onClick={handleSend}
                    disabled={isConnected && !hasContent}
                    title={!isConnected ? "Click to Connect" : "Send Data"}
                >
                    <Send size={16} className={!isConnected ? "opacity-50" : ""} />
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
