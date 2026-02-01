import { useRef, useState, useEffect } from 'react';
import { SessionState, SessionConfig } from '../../types/session';
import { SerialInput } from './SerialInput';
import { Settings, Eye, EyeOff } from 'lucide-react';

interface SerialMonitorProps {
    session: SessionState;
    onShowSettings?: (view: string) => void;
    onSend?: (data: string | Uint8Array) => void;
    onUpdateConfig?: (updates: Partial<SessionConfig>) => void;
}

export const SerialMonitor = ({ session, onShowSettings, onSend, onUpdateConfig }: SerialMonitorProps) => {
    const { logs, isConnected, config } = session;
    const currentPort = config.connection.path;
    const scrollRef = useRef<HTMLDivElement>(null);

    // Display Settings State
    const [viewMode, setViewMode] = useState<'text' | 'hex'>('text');
    const [showTimestamp, setShowTimestamp] = useState(true);
    const [filterMode, setFilterMode] = useState<'all' | 'rx' | 'tx'>('all');
    const [encoding, setEncoding] = useState<'utf-8' | 'gbk' | 'ascii'>('utf-8');
    const [fontSize, setFontSize] = useState<number>(13);
    const [fontFamily, setFontFamily] = useState<'mono' | 'consolas' | 'courier'>('mono');
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);

    // CRC is in session.config.rxCRC.enabled
    const crcEnabled = (config as any).rxCRC?.enabled || false;

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
                // Proper GBK decoding requires iconv-lite or similar
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
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

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

    // Filter logs
    const filteredLogs = logs.filter(log => {
        if (filterMode === 'rx') return log.type === 'RX';
        if (filterMode === 'tx') return log.type === 'TX';
        return true; // 'all'
    });

    const fontFamilyClass = fontFamily === 'consolas' ? 'font-[Consolas]' : fontFamily === 'courier' ? 'font-[Courier]' : 'font-mono';

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
                            onClick={() => setViewMode('text')}
                        >
                            Text
                        </button>
                        <button
                            className={`px-2 py-0.5 text-[10px] rounded ${viewMode === 'hex' ? 'bg-[#007acc] text-white' : 'text-[#969696] hover:text-[#cccccc]'}`}
                            onClick={() => setViewMode('hex')}
                        >
                            Hex
                        </button>
                    </div>

                    {/* CRC Toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#969696] hover:text-[#cccccc]">
                        <input
                            type="checkbox"
                            checked={crcEnabled}
                            onChange={toggleCRC}
                            className="w-3 h-3"
                        />
                        CRC Check
                    </label>

                    {/* Timestamp Toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#969696] hover:text-[#cccccc]">
                        <input
                            type="checkbox"
                            checked={showTimestamp}
                            onChange={(e) => setShowTimestamp(e.target.checked)}
                            className="w-3 h-3"
                        />
                        Timestamp
                    </label>

                    {/* RX/TX Filter */}
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#969696]">Show:</span>
                        <select
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                            value={filterMode}
                            onChange={(e) => setFilterMode(e.target.value as any)}
                        >
                            <option value="all">All</option>
                            <option value="rx">RX Only</option>
                            <option value="tx">TX Only</option>
                        </select>
                    </div>

                    {/* Encoding */}
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[#969696]">Encoding:</span>
                        <select
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                            value={encoding}
                            onChange={(e) => setEncoding(e.target.value as any)}
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
                            <div className="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-sm shadow-lg p-3 z-50 min-w-[200px]">
                                <div className="text-[11px] text-[#cccccc] mb-2 font-medium">Display Settings</div>

                                {/* Font Size */}
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] text-[#969696]">Font Size:</span>
                                    <select
                                        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[11px] text-[#cccccc] rounded-sm outline-none px-1.5 py-0.5"
                                        value={fontSize}
                                        onChange={(e) => setFontSize(Number(e.target.value))}
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
                                        onChange={(e) => setFontFamily(e.target.value as any)}
                                    >
                                        <option value="mono">Monospace</option>
                                        <option value="consolas">Consolas</option>
                                        <option value="courier">Courier</option>
                                    </select>
                                </div>
                            </div>
                        )}
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
            />
        </div>
    );
};
