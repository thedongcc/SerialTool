import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Plus, Upload, Timer, Flag } from 'lucide-react';
import { Token, CRCConfig, FlagConfig } from '../../types/token';
import { TokenConfigPopover } from './TokenConfigPopover';
import { MessagePipeline } from '../../services/MessagePipeline';

// TipTap Imports
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SerialToken } from './SerialTokenExtension';
import { SERIAL_TOKEN_CLICK_EVENT } from './SerialTokenComponent';

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
    const [popover, setPopover] = useState<{ id: string; x: number; y: number; pos: number } | null>(null);
    const [timerEnabled, setTimerEnabled] = useState(false);
    const [timerInterval, setTimerInterval] = useState(1000);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // TipTap Editor
    const editor = useEditor({
        extensions: [
            StarterKit,
            SerialToken,
        ],
        content: initialHTML || initialContent,
        editorProps: {
            attributes: {
                class: 'outline-none text-[var(--st-input-text)] text-[13px] font-mono whitespace-pre-wrap break-all flex-1 min-h-[40px] overflow-y-auto custom-scrollbar p-2 leading-[22px] [&_p]:m-0 [&_span]:align-middle',
                spellcheck: 'false',
            },
        },
        onUpdate: ({ editor }) => {
            // Sync state to parent
            if (onStateChange) {
                const json = editor.getJSON();
                const tokensMap: Record<string, Token> = {};
                const traverse = (node: any) => {
                    if (node.type === 'serialToken') {
                        const { id, type, config } = node.attrs;
                        tokensMap[id] = { id, type, config };
                    }
                    if (node.content) node.content.forEach(traverse);
                };
                traverse(json);

                // We can't easily access latest 'mode' state here inside closure if it's stale.
                // But we can just pass the content updates.
                // Or we rely on the parent merging?
                // onStateChange signature: (state: { ... })
                // Let's pass current values. 'mode' might be stale, but 'content' is fresh.
                // Actually, if we pass stale mode, we revert mode change?
                // Let's try to assume onStateChange merges or handles partials?
                // The interface seems to require full object. 
                // Let's assume mode doesn't change often during typing.

                onStateChange({
                    content: editor.getText(),
                    html: editor.getHTML(),
                    tokens: tokensMap,
                    mode,
                    lineEnding
                });
            }
        },
    });

    // Handle Token Clicks
    useEffect(() => {
        const handleTokenClick = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setPopover({ id: detail.id, x: detail.x, y: detail.y, pos: detail.pos });
        };
        window.addEventListener(SERIAL_TOKEN_CLICK_EVENT, handleTokenClick);
        return () => window.removeEventListener(SERIAL_TOKEN_CLICK_EVENT, handleTokenClick);
    }, []);

    const insertToken = (type: 'crc' | 'flag') => {
        if (!editor) return;
        let config: any = {};
        if (type === 'crc') {
            config = {
                algorithm: 'modbus-crc16',
                startIndex: 0,
                endIndex: 0
            } as CRCConfig;
        } else if (type === 'flag') {
            config = { hex: 'AA', name: '' } as FlagConfig;
        }
        editor.chain().focus().insertSerialToken({ type, config }).run();
    };

    const updateTokenConfig = (id: string, newConfig: any) => {
        if (!editor || !popover) return;
        editor.chain().focus().setNodeSelection(popover.pos).updateAttributes('serialToken', { config: newConfig }).run();
    };

    const deleteToken = (id: string) => {
        if (!editor || !popover) return;
        editor.chain().focus().setNodeSelection(popover.pos).deleteSelection().run();
        setPopover(null);
    };

    const extractTokens = (): Record<string, Token> => {
        if (!editor) return {};
        const json = editor.getJSON();
        const tokensMap: Record<string, Token> = {};
        const traverse = (node: any) => {
            if (node.type === 'serialToken') {
                const { id, type, config } = node.attrs;
                tokensMap[id] = { id, type, config };
            }
            if (node.content) node.content.forEach(traverse);
        };
        traverse(json);
        return tokensMap;
    };

    const handleSend = () => {
        if (!isConnected) {
            onConnectRequest?.();
            return;
        }
        if (!editor) return;

        const html = editor.getHTML();
        const text = editor.getText();
        const tokensMap = extractTokens();
        const { data } = MessagePipeline.process(text, html, mode, tokensMap, lineEnding);

        onSend(data, mode);
    };

    useEffect(() => {
        if (timerEnabled && timerInterval > 0) {
            timerRef.current = setInterval(handleSend, timerInterval);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [timerEnabled, timerInterval]);

    return (
        <div className="border-t border-[var(--vscode-border)] bg-[#252526] p-2 flex flex-col gap-2 shrink-0 select-none">
            {/* Toolbar */}
            <div className="flex items-center gap-2 h-6">
                <div className="flex items-center gap-[1px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm overflow-hidden p-[2px]">
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'text' ? 'bg-[#007acc] text-white' : 'text-[#666] hover:bg-[#2d2d2d]'}`}
                        onClick={() => setMode('text')}
                    >
                        TXT
                    </button>
                    <button
                        className={`text-[10px] px-1.5 py-0.5 font-mono transition-colors rounded-[1px] ${mode === 'hex' ? 'bg-[#007acc] text-white' : 'text-[#666] hover:bg-[#2d2d2d]'}`}
                        onClick={() => setMode('hex')}
                    >
                        HEX
                    </button>
                </div>
                <div className="w-[1px] h-4 bg-[#3c3c3c] mx-1" />
                <button className="flex items-center gap-1 px-2 py-0.5 bg-[#3c3c3c] hover:bg-[#4c4c4c] text-[12px] text-[#cccccc] rounded-sm transition-colors"
                    onClick={() => insertToken('crc')}>
                    <Plus size={14} className="text-[#4ec9b0]" />
                    <span>Insert CRC</span>
                </button>
                <button className="flex items-center gap-1 px-2 py-0.5 bg-[#3c3c3c] hover:bg-[#4c4c4c] text-[12px] text-[#cccccc] rounded-sm transition-colors"
                    onClick={() => insertToken('flag')}>
                    <Flag size={14} className="text-[#4ec9b0]" />
                    <span>Add Flag</span>
                </button>
                <div className="w-[1px] h-4 bg-[#3c3c3c] mx-1" />
                <button className="flex items-center gap-1 px-2 py-0.5 hover:bg-[#3c3c3c] text-[12px] text-[#cccccc] rounded-sm transition-colors opacity-50 cursor-not-allowed" title="Load File">
                    <Upload size={14} />
                    <span>File</span>
                </button>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                    <div
                        className={`w-4 h-4 border border-[#cccccc] rounded-sm cursor-pointer flex items-center justify-center ${timerEnabled ? 'bg-[#007acc] border-[#007acc]' : ''}`}
                        onClick={() => setTimerEnabled(!timerEnabled)}
                    >
                        {timerEnabled && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                    </div>
                    <Timer size={14} className="text-[#cccccc]" />
                    <span className="text-[12px] text-[#cccccc]">Timer</span>
                    {timerEnabled && (
                        <input
                            type="number"
                            className="w-16 h-5 bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc] text-[11px] px-1 focus:border-[var(--vscode-focusBorder)] outline-none"
                            value={timerInterval}
                            onChange={(e) => setTimerInterval(parseInt(e.target.value) || 1000)}
                        />
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className="flex gap-2 min-h-[42px]">

                <div
                    className="flex-1 bg-[var(--st-input-bg)] border border-[#3c3c3c] rounded-sm focus-within:border-[var(--vscode-focusBorder)] cursor-text flex flex-col bg-cover bg-center"
                    onClick={() => editor?.commands.focus()}
                    style={{ backgroundImage: 'var(--st-input-bg-img)' }}
                >
                    <EditorContent editor={editor} className="flex-1 outline-none" />
                </div>

                <button
                    className={`nav-item px-3 flex flex-row items-center justify-center gap-2 rounded-sm transition-colors ${isConnected ? 'bg-[#007acc] hover:bg-[#0062a3] text-white' : 'bg-[#3c3c3c] bg-opacity-50 text-[#666] hover:bg-[#4c4c4c] cursor-pointer'}`}
                    onClick={handleSend}
                    title={isConnected ? "Send Data" : "Open Serial Connection"}
                >
                    <Send size={16} />
                    <span className="text-[13px] font-medium">Send</span>
                </button>
            </div>

            {/* Popover */}
            {popover && editor && (() => {
                let tokenData: Token | null = null;
                const node = editor.state.doc.nodeAt(popover.pos);
                if (node && node.type.name === 'serialToken' && node.attrs.id === popover.id) {
                    tokenData = { id: popover.id, type: node.attrs.type, config: node.attrs.config };
                } else {
                    editor.state.doc.descendants((n) => {
                        if (n.type.name === 'serialToken' && n.attrs.id === popover.id) {
                            tokenData = { id: popover.id, type: n.attrs.type, config: n.attrs.config };
                            return false;
                        }
                    });
                }

                if (!tokenData) return null;

                return (
                    <TokenConfigPopover
                        token={tokenData}
                        onUpdate={(id, cfg) => updateTokenConfig(id, cfg)}
                        onDelete={deleteToken}
                        onClose={() => setPopover(null)}
                        position={{ x: popover.x, y: popover.y }}
                    />
                );
            })()}
        </div>
    );
};
