import { useRef, useState, useEffect } from 'react';
import { SessionState, SessionConfig } from '../../types/session';
import { SerialInput } from './SerialInput';
import { Settings, Eye, EyeOff, X, Trash2, Download, ArrowDown } from 'lucide-react';
import { CRCConfig } from '../../utils/crc';


interface SerialMonitorProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
    onInputStateChange?: (inputState: any) => void;
    onClearLogs?: () => void;
    onConnectRequest?: () => void;
}

export const SerialMonitor = ({ session, onShowSettings, onSend, onUpdateConfig, onInputStateChange, onClearLogs, onConnectRequest }: SerialMonitorProps) => {
    const { logs, isConnected, config } = session;
    const currentPort = config.connection.path;
    const scrollRef = useRef<HTMLDivElement>(null);

    const uiState = (config as any).uiState || {};

    // Display Settings State - Initialize from uiState
    const [viewMode, setViewMode] = useState<'text' | 'hex'>(uiState.viewMode || 'hex');
    const [showTimestamp, setShowTimestamp] = useState(uiState.showTimestamp !== undefined ? uiState.showTimestamp : true);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>(uiState.filterMode || 'all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>(uiState.encoding || 'utf-8');
    const [fontSize, setFontSize] = useState<number>(uiState.fontSize || 13);
    const [fontFamily, setFontFamily] = useState<'mono' | 'consolas' | 'courier'>(uiState.fontFamily || 'mono');
    const [autoScroll, setAutoScroll] = useState(uiState.autoScroll !== undefined ? uiState.autoScroll : true);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showCRCPanel, setShowCRCPanel] = useState(false);

    // CRC is in session.config.rxCRC.enabled
    const crcEnabled = (config as any).rxCRC?.enabled || false;
    const rxCRC = (config as any).rxCRC || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };

    // Save UI state when it changes
    const saveUIState = (updates: any) => {
        if (onUpdateConfig) {
            const currentUIState = (config as any).uiState || {};
            onUpdateConfig({ uiState: { ...currentUIState, ...updates } } as any);
        }
    };

    // Calculate statistics
    const txBytes = logs.filter(log => log.type === 'TX').reduce((sum, log) => {
        if (typeof log.data === 'string') {
            return sum + new TextEncoder().encode(log.data).length;
        }
        return sum + log.data.length;
    }, 0);

    const rxBytes = logs.filter(log => log.type === 'RX').reduce((sum, log) => {
        if (typeof log.data === 'string') {
            return sum + new TextEncoder().encode(log.data).length;
        }
        return sum + log.data.length;
    }, 0);

    // Clear logs
    const handleClearLogs = () => {
        if (onClearLogs) {
            onClearLogs();
        }
    };

    // Save logs to file
    const handleSaveLogs = () => {
        const content = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const data = formatData(log.data, viewMode, encoding);
            return `[${timestamp}] [${log.type}] ${data}`;
        }).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial_log_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatData = (data: string | Uint8Array, mode: 'text' | 'hex', encoding: string) => {
        if (mode === 'hex') {
            if (typeof data === 'string') {
                // Convert string to hex bytes
                const encoder = new TextEncoder();
                const bytes = encoder.encode(data);
                return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            }
            return Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        }

        // Text mode
        if (typeof data === 'string') return data;

        try {
            if (encoding === 'gbk') {
                // TextDecoder in browsers may not support GBK directly
                // For now, fallback to utf-8 or use a polyfill
                return new TextDecoder('utf-8').decode(data);
            } else if (encoding === 'ascii') {
                return new TextDecoder('ascii').decode(data);
            } else {
                return new TextDecoder('utf-8').decode(data);
            }
        } catch (e) {
            return new TextDecoder().decode(data);
        }
    };

    useEffect(() => {
        if (scrollRef.current && autoScroll) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Auto-connect on mount if configured


    const handleSend = (data: string | Uint8Array, mode: 'text' | 'hex') => {
        if (!onSend) return;

        if (data instanceof Uint8Array) {
            onSend(data);
            return;
        }

        const textData = data as string;

        if (mode === 'hex') {
            // Parse hex string "AA BB CC" -> Uint8Array
            const cleanHex = textData.replace(/\s+/g, '');
            if (cleanHex.length % 2 !== 0) {
                console.warn("Invalid hex length");
                return;
            }
            const byteArray = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < cleanHex.length; i += 2) {
                byteArray[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
            }
            onSend(byteArray);
        } else {
            onSend(textData);
        }
    };

    const toggleCRC = () => {
        if (!onUpdateConfig) return;
        const currentRxCRC = (config as any).rxCRC || { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 };
        onUpdateConfig({ rxCRC: { ...currentRxCRC, enabled: !crcEnabled } } as any);
    };

    const updateRxCRC = (updates: Partial<CRCConfig>) => {
        if (!onUpdateConfig) return;
        onUpdateConfig({ rxCRC: { ...rxCRC, ...updates } } as any);
    };

    // Filter logs
    const filteredLogs = logs.filter(log => {
        if (filterMode === 'rx') return log.type === 'RX';
        if (filterMode === 'tx') return log.type === 'TX';
        return true; // 'all'
    });

    const fontFamilyClass = fontFamily === 'consolas' ? 'font-[Consolas]' : fontFamily === 'courier' ? 'font-[Courier]' : 'font-mono';

    const handleInputStateChange = (state: { content: string, html: string, tokens: any, mode: 'text' | 'hex', lineEnding: string }) => {
        saveUIState({
            inputContent: state.content,
            inputHTML: state.html,
            inputTokens: state.tokens,
            inputMode: state.mode,
            lineEnding: state.lineEnding
        });
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[#1e1e1e]">
            {/* Enhanced Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2b2b2b] bg-[#252526] shrink-0">
                <div className="text-sm font-medium text-[#cccccc]">
                    {isConnected ? `Connected to ${currentPort}` : 'Disconnected'}
                </div>

                <div className="flex items-center gap-4">
                    {/* Hex/Text Display Mode */}
                    <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c]">
                        <button
                            className={`px-2 py-0.5 text-[10px] rounded ${viewMode === 'text' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => { setViewMode('text'); saveUIState({ viewMode: 'text' }); }}
                        >
                            Text
                        </button>
                        <button
                            className={`px-2 py-0.5 text-[10px] rounded ${viewMode === 'hex' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => { setViewMode('hex'); saveUIState({ viewMode: 'hex' }); }}
                        >
                            Hex
                        </button>
                    </div>

                    {/* CRC Toggle with Config */}
                    <div className="relative">
                        <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#969696] hover:text-[#cccccc]">
                                <input
                                    type="checkbox"
                                    checked={crcEnabled}
                                    onChange={toggleCRC}
                                    className="w-3 h-3"
                                />
                                CRC Check
                            </label>
                            <Settings
                                size={12}
                                className="cursor-pointer text-[#969696] hover:text-white"
                                onClick={(e) => { e.stopPropagation(); setShowCRCPanel(!showCRCPanel); }}
                            />
                        </div>

                        {showCRCPanel && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowCRCPanel(false)} />
                                <div className="absolute left-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-sm shadow-lg p-3 z-50 min-w-[220px]">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[11px] text-[#cccccc] font-medium">RX CRC Settings</div>
                                        <X size={14} className="cursor-pointer text-[#969696] hover:text-white" onClick={() => setShowCRCPanel(false)} />
                                    </div>

                                    {/* Algorithm */}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-[#969696]">Algorithm:</span>
                                        <select
                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                                            value={rxCRC.algorithm}
                                            onChange={(e) => updateRxCRC({ algorithm: e.target.value as any })}
                                        >
                                            <option value="modbus-crc16">Modbus CRC16</option>
                                            <option value="ccitt-crc16">CCITT CRC16</option>
                                            <option value="crc32">CRC32</option>
                                            <option value="none">None</option>
                                        </select>
                                    </div>

                                    {/* Start Index */}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-[#969696]">Start:</span>
                                        <input
                                            type="number"
                                            min="0"
                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5 w-16"
                                            value={rxCRC.startIndex}
                                            onChange={(e) => updateRxCRC({ startIndex: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>

                                    {/* End Index */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-[#969696]">End:</span>
                                        <select
                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5 w-20"
                                            value={rxCRC.endIndex}
                                            onChange={(e) => updateRxCRC({ endIndex: parseInt(e.target.value) })}
                                        >
                                            <option value="-1">End (-1)</option>
                                            <option value="-2">-2</option>
                                            <option value="-3">-3</option>
                                        </select>
                                    </div>
                                </div>
                            </>
                        )}


                    </div>

                    {/* Timestamp Toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#969696] hover:text-[#cccccc]">
                        <input
                            type="checkbox"
                            checked={showTimestamp}
                            onChange={(e) => { setShowTimestamp(e.target.checked); saveUIState({ showTimestamp: e.target.checked }); }}
                            className="w-3 h-3"
                        />
                        Timestamp
                    </label>

                    {/* RX/TX Filter - Button Group */}
                    <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-[#3c3c3c]">
                        <button
                            className={`px-2 py-0.5 text-[10px] rounded ${filterMode === 'all' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => { setFilterMode('all'); saveUIState({ filterMode: 'all' }); }}
                        >
                            All
                        </button>
                        <button
                            className={`px-2 py-0.5 text-[10px] rounded ${filterMode === 'rx' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => { setFilterMode('rx'); saveUIState({ filterMode: 'rx' }); }}
                        >
                            RX
                        </button>
                        <button
                            className={`px-2 py-0.5 text-[10px] rounded ${filterMode === 'tx' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => { setFilterMode('tx'); saveUIState({ filterMode: 'tx' }); }}
                        >
                            TX
                        </button>
                    </div>

                    {/* Encoding */}
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#969696]">Encoding:</span>
                        <select
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                            value={encoding}
                            onChange={(e) => { setEncoding(e.target.value as any); saveUIState({ encoding: e.target.value as any }); }}
                        >
                            <option value="utf-8">UTF-8</option>
                            <option value="gbk">GBK</option>
                            <option value="ascii">ASCII</option>
                        </select>
                    </div>

                    {/* Settings Popover Toggle */}
                    <div className="relative">
                        <button
                            className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-[#cccccc] transition-colors"
                            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                            title="Display Settings"
                        >
                            <Settings size={14} />
                        </button>

                        {showSettingsPanel && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSettingsPanel(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-sm shadow-lg p-3 z-50 min-w-[200px]">
                                    <div className="text-[11px] text-[#cccccc] mb-2 font-medium">Display Settings</div>

                                    {/* Font Size */}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-[#969696]">Font Size:</span>
                                        <select
                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                                            value={fontSize}
                                            onChange={(e) => { const val = Number(e.target.value); setFontSize(val); saveUIState({ fontSize: val }); }}
                                        >
                                            <option value={11}>11px</option>
                                            <option value={12}>12px</option>
                                            <option value={13}>13px</option>
                                            <option value={14}>14px</option>
                                            <option value={15}>15px</option>
                                            <option value={16}>16px</option>
                                        </select>
                                    </div>

                                    {/* Font Family */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-[#969696]">Font:</span>
                                        <select
                                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                                            value={fontFamily}
                                            onChange={(e) => { setFontFamily(e.target.value as any); saveUIState({ fontFamily: e.target.value as any }); }}
                                        >
                                            <option value="mono">Monospace</option>
                                            <option value="consolas">Consolas</option>
                                            <option value="courier">Courier</option>
                                        </select>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Statistics */}
                    <div className="flex items-center gap-2 text-[10px] text-[#969696] border-l border-[#3c3c3c] pl-2">
                        <span>TX: {txBytes}B</span>
                        <span>RX: {rxBytes}B</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-2">
                        <button
                            className={`p-1 rounded transition-colors ${autoScroll ? 'text-[#4ec9b0] bg-[#1e1e1e]' : 'text-[#969696] hover:text-[#cccccc] hover:bg-[#3c3c3c]'}`}
                            onClick={() => {
                                const newState = !autoScroll;
                                setAutoScroll(newState);
                                saveUIState({ autoScroll: newState });
                                // If enabling, scroll to bottom immediately
                                if (newState && scrollRef.current) {
                                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                                }
                            }}
                            title={`Auto Scroll: ${autoScroll ? 'On' : 'Off'}`}
                        >
                            <ArrowDown size={14} />
                        </button>
                        <button
                            className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-[#cccccc] transition-colors"
                            onClick={handleSaveLogs}
                            title="Save Logs"
                        >
                            <Download size={14} />
                        </button>
                        <button
                            className="p-1 hover:bg-[#3c3c3c] rounded text-[#969696] hover:text-[#cccccc] transition-colors"
                            onClick={handleClearLogs}
                            title="Clear Logs"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Log Area */}
            <div className={`flex-1 overflow-auto p-4 ${fontFamilyClass}`} style={{ fontSize: `${fontSize}px` }} ref={scrollRef}>
                {filteredLogs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-[#666]">
                        <p>No data</p>
                    </div>
                )}
                {filteredLogs.map((log, index) => (
                    <div key={index} className={`flex gap-2 mb-1 hover:bg-[#2a2d2e] rounded px-1 group relative ${log.crcStatus === 'error' ? 'bg-[#4b1818] border-l-2 border-[#f48771]' : ''
                        }`}>
                        {showTimestamp && (
                            <span className="text-[#569cd6] shrink-0 select-none w-[85px]">
                                {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0')}
                            </span>
                        )}
                        <span className={`font-bold shrink-0 select-none w-[30px] ${log.type === 'TX' ? 'text-[#ce9178]' :
                            log.type === 'RX' ? 'text-[#6a9955]' :
                                'text-[#969696]'
                            }`}>
                            {log.type}
                        </span>
                        <span className={`whitespace-pre-wrap break-all ${log.type === 'ERROR' ? 'text-[#f48771]' : 'text-[#cccccc]'
                            }`}>
                            {formatData(log.data, viewMode, encoding)}
                        </span>
                        {log.crcStatus === 'error' && (
                            <span className="absolute right-2 top-0.5 text-[10px] text-[#f48771] bg-[#1e1e1e] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                CRC Error
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Serial Input Area */}
            <SerialInput
                onSend={handleSend}
                initialContent={uiState.inputContent || ''}
                initialHTML={uiState.inputHTML || ''}
                initialTokens={uiState.inputTokens as any || {}}
                initialMode={uiState.inputMode || 'hex'}
                initialLineEnding={uiState.lineEnding || '\r\n'}
                onStateChange={handleInputStateChange}
                isConnected={isConnected}
                onConnectRequest={() => {
                    // Open config sidebar and flash button
                    if (onShowSettings) onShowSettings('serial');
                    if (onInputStateChange) onInputStateChange({ highlightConnect: Date.now() });
                }}
            />
        </div>
    );
};
