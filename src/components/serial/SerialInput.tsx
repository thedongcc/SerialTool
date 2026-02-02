import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Plus, Upload, Timer, Flag } from 'lucide-react';
import { Token, CRCConfig, FlagConfig } from '../../types/token';
import { TokenConfigPopover } from './TokenConfigPopover';
import { MessagePipeline } from '../../services/MessagePipeline';

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

    // Undo/Redo History
    const historyRef = useRef<{ html: string, tokens: Record<string, Token> }[]>([]);
    const historyIndexRef = useRef(-1);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const tokensRef = useRef(tokens);
    tokensRef.current = tokens;

    const saveHistory = (force = false, tokensOverride?: Record<string, Token>) => {
        if (!inputRef.current) return;
        const currentHTML = inputRef.current.innerHTML;
        const currentTokens = tokensOverride || { ...tokensRef.current };

        // Avoid duplicates
        const last = historyRef.current[historyIndexRef.current];
        if (!force && last && last.html === currentHTML && JSON.stringify(last.tokens) === JSON.stringify(currentTokens)) {
            return;
        }

        // Truncate future if we are in middle of stack
        const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        newHistory.push({ html: currentHTML, tokens: currentTokens });

        // Limit stack size
        if (newHistory.length > 50) newHistory.shift();

        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;
    };

    const undo = () => {
        if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            const state = historyRef.current[historyIndexRef.current];
            restoreState(state);
        }
    };

    const redo = () => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++;
            const state = historyRef.current[historyIndexRef.current];
            restoreState(state);
        }
    };

    const restoreState = (state: { html: string, tokens: Record<string, Token> }) => {
        if (!inputRef.current) return;
        setTokens(state.tokens);
        inputRef.current.innerHTML = state.html;
        // Re-bind events
        const spans = inputRef.current.querySelectorAll('span[data-token-id]');
        spans.forEach(span => {
            const id = span.getAttribute('data-token-id')!;
            bindTokenEvents(span as HTMLElement, id);
        });
        // Move cursor to end (simplification)
        const range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        notifyStateChange(state.tokens);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

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
                    const el = span as HTMLElement;
                    el.draggable = true;
                    el.classList.remove('select-none');
                    el.ondragstart = (e) => {
                        if (e.dataTransfer) {
                            e.dataTransfer.setData('text/html', el.outerHTML);
                            e.dataTransfer.effectAllowed = 'copyMove';
                        }
                    };
                    el.onclick = (e) => {
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

    const bindTokenEvents = (span: HTMLElement, id: string) => {
        span.draggable = true;
        span.classList.remove('select-none');

        // Remove old listeners to avoid stacking if called multiple times (though simple assignment overwrites)
        span.ondragstart = (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/html', span.outerHTML);
                e.dataTransfer.effectAllowed = 'copyMove';
            }
            span.classList.add('dragging');
        };

        span.ondragend = () => {
            span.classList.remove('dragging');
        };

        span.onclick = (e) => {
            e.stopPropagation();
            const rect = span.getBoundingClientRect();
            setPopover({ id, x: rect.left, y: rect.bottom });
        };
    };

    // Sync input handling and cleanup tokens
    const handleInput = () => {
        if (inputRef.current) {
            // 1. Re-bind events & De-duplicate tokens (Fix for Drag & Drop)
            const allSpans = Array.from(inputRef.current.querySelectorAll('span[data-token-id]'));
            const idMap = new Map<string, HTMLElement[]>();

            allSpans.forEach(s => {
                const span = s as HTMLElement;
                const id = span.getAttribute('data-token-id')!;

                // Always re-bind events because drops create fresh elements without listeners
                bindTokenEvents(span, id);

                if (!idMap.has(id)) idMap.set(id, []);
                idMap.get(id)!.push(span);
            });

            // Remove duplicates (Source of drag)
            idMap.forEach((spans) => {
                if (spans.length > 1) {
                    const draggingEl = spans.find(s => s.classList.contains('dragging'));
                    if (draggingEl) {
                        draggingEl.remove();
                    } else {
                        // Keep last one
                        for (let i = 0; i < spans.length - 1; i++) {
                            spans[i].remove();
                        }
                    }
                }
            });

            let nextTokens = { ...tokens };
            let changed = false;

            // 2. Resurrect tokens found in DOM but missing in State (e.g. after Undo)
            const activeSpans = Array.from(inputRef.current.querySelectorAll('span[data-token-id]'));
            activeSpans.forEach(s => {
                const span = s as HTMLElement;
                const id = span.getAttribute('data-token-id')!;

                if (!nextTokens[id]) {
                    const type = span.getAttribute('data-token-type') as 'crc' | 'flag';
                    const configStr = span.getAttribute('data-token-config');
                    if (type && configStr) {
                        try {
                            const config = JSON.parse(configStr);
                            nextTokens[id] = { id, type, config };
                            changed = true;
                            console.log('[SerialInput] Resurrected token:', id);
                        } catch (e) {
                            console.error('Failed to resurrect token', id, e);
                        }
                    }
                }
            });

            // 3. Check for deleted tokens and remove from state
            const currentIds = new Set(
                activeSpans.map(el => el.getAttribute('data-token-id'))
            );

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

            // Debounce save history
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            // Pass nextTokens to ensure we save the state that includes any resurrected/cleaned tokens
            saveTimeoutRef.current = setTimeout(() => saveHistory(false, nextTokens), 500);
        }
    };

    const handleSend = () => {
        if (!isConnected && onConnectRequest) {
            onConnectRequest();
            return;
        }

        if (!inputRef.current) return;

        console.log('[SerialInput] handleSend tokens:', tokens);

        const { data } = MessagePipeline.process(
            inputRef.current.innerText,
            inputRef.current.innerHTML,
            mode,
            tokens,
            lineEnding
        );

        if (data.length === 0) return;

        // Send data with current mode
        onSend(data, mode);
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
            span.setAttribute('data-token-type', type);
            span.setAttribute('data-token-config', JSON.stringify(newToken.config));
            span.draggable = true;
            // Updated style: Non-rounded (sharp), narrow padding, 13px font
            span.className = 'inline-block bg-[#2d2d2d] text-[#4ec9b0] px-[2px] rounded-none cursor-pointer text-[13px] font-mono align-baseline hover:bg-[#383838] transition-colors';

            if (type === 'crc') {
                span.innerText = 'CRC: Modbus';
            } else {
                span.innerText = 'Flag: AA';
            }

            bindTokenEvents(span, id);

            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && inputRef.current.contains(sel.anchorNode)) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(span);
                range.setStartAfter(span);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                inputRef.current.appendChild(span);
            }

            handleInput();
        }

        const newTokens = { ...tokens, [id]: newToken };
        setTokens(newTokens);
        notifyStateChange(newTokens);
        // Save history with the NEW tokens immediately
        saveHistory(true, newTokens);
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
                            let label = 'CRC';
                            switch (newConfig.algorithm) {
                                case 'modbus-crc16': label = 'CRC: Modbus'; break;
                                case 'ccitt-crc16': label = 'CRC: CCITT'; break;
                                case 'crc32': label = 'CRC: 32'; break;
                            }
                            el.innerText = label;
                        } else if (token.type === 'flag') {
                            const config = newConfig as FlagConfig;
                            const hex = config.hex || '';
                            const display = hex.length > 20 ? hex.substring(0, 20) + '...' : hex; // Longer preview
                            if (config.name) {
                                el.innerText = `${config.name}: ${display}`;
                            } else {
                                el.innerText = hex ? `Flag: ${display}` : 'Flag';
                            }
                        }
                    }
                }
            }
            return { ...prev, [id]: { ...prev[id], config: newConfig } };
        });

        const updatedTokens = { ...tokens, [id]: { ...tokens[id], config: newConfig } };
        notifyStateChange(updatedTokens);
        saveHistory(true); // Save on config change
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
                                        // Preserve boundary spacing
                                        const hasLeading = /^\s/.test(text);
                                        const hasTrailing = /\s$/.test(text);

                                        // Remove all whitespace and non-hex for formatting
                                        const clean = text.replace(/\s+/g, '').replace(/[^0-9A-Fa-f]/g, '');

                                        if (clean.length > 0) {
                                            let formatted = clean.match(/.{1,2}/g)?.join(' ') || clean;

                                            // Restore boundary spaces if they existed
                                            if (hasLeading && !formatted.startsWith(' ')) formatted = ' ' + formatted;
                                            if (hasTrailing && !formatted.endsWith(' ')) formatted = formatted + ' ';

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
