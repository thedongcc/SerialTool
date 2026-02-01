import { RefreshCw, Save, FolderOpen, Play, Square } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SerialSessionConfig, MqttSessionConfig } from '../../types/session';
import { MqttConfigPanel } from '../mqtt/MqttConfigPanel';

interface ConfigSidebarProps {
    sessionManager: ReturnType<typeof useSessionManager>;
}

// Extracted Serial Panel
const SerialConfigPanel = ({ session, sessionManager }: { session: any, sessionManager: ReturnType<typeof useSessionManager> }) => {
    const { config, isConnected, isConnecting } = session;
    const { connection, txCRC, rxCRC } = config as SerialSessionConfig;
    const { updateSessionConfig, connectSession, disconnectSession, listPorts, ports } = sessionManager;

    const handleToggleConnection = () => {
        if (isConnected) {
            disconnectSession(session.id);
        } else {
            if (connection.path) {
                connectSession(session.id);
            }
        }
    };

    const updateConnection = (updates: Partial<typeof connection>) => {
        updateSessionConfig(session.id, { connection: { ...connection, ...updates } });
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            <div className="px-4 py-2 border-b border-[var(--vscode-border)] bg-[#252526] text-[11px] font-bold text-[#cccccc] uppercase tracking-wide">
                <span>Settings</span>
                {session.unsaved && <span className="ml-2 w-2 h-2 rounded-full bg-white opacity-50 inline-block" title="Unsaved changes"></span>}
            </div>

            <div className="px-4 py-2 flex flex-col gap-3">
                {/* Port Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696] flex justify-between">
                        Port
                        <RefreshCw
                            size={12}
                            className="cursor-pointer hover:text-white"
                            onClick={listPorts}
                            title="Refresh Ports"
                        />
                    </label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={connection.path}
                        onChange={(e) => updateConnection({ path: e.target.value })}
                        disabled={isConnected}
                    >
                        <option value="" disabled>Select Port</option>
                        {ports.map(port => (
                            <option key={port.path} value={port.path}>
                                {port.path} {port.manufacturer ? `- ${port.manufacturer}` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Baud Rate Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Baud Rate</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={connection.baudRate}
                        onChange={(e) => updateConnection({ baudRate: Number(e.target.value) })}
                        disabled={isConnected}
                    >
                        {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(rate => (
                            <option key={rate} value={rate}>{rate}</option>
                        ))}
                    </select>
                </div>

                {/* Data Bits */}
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Data Bits</label>
                        <select
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                            value={connection.dataBits}
                            onChange={(e) => updateConnection({ dataBits: Number(e.target.value) as any })}
                            disabled={isConnected}
                        >
                            {[5, 6, 7, 8].map(bit => (
                                <option key={bit} value={bit}>{bit}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Stop Bits</label>
                        <select
                            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                            value={connection.stopBits}
                            onChange={(e) => updateConnection({ stopBits: Number(e.target.value) as any })}
                            disabled={isConnected}
                        >
                            {[1, 1.5, 2].map(bit => (
                                <option key={bit} value={bit}>{bit}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Parity */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Parity</label>
                    <select
                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[13px] text-[#cccccc] p-1 outline-none focus:border-[var(--vscode-selection)]"
                        value={connection.parity}
                        onChange={(e) => updateConnection({ parity: e.target.value as any })}
                        disabled={isConnected}
                    >
                        {['none', 'even', 'odd', 'mark', 'space'].map(p => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>

                {/* Connect/Disconnect Button & Status */}
                <div className="space-y-2 mt-auto pt-2">
                    <button
                        className={`w-full py-1.5 px-3 text-white text-[13px] rounded-sm transition-colors flex items-center justify-center gap-2 ${isConnected
                            ? 'bg-[#a1260d] hover:bg-[#c93f24]'
                            : 'bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                        disabled={!connection.path && !isConnected}
                        onClick={handleToggleConnection}
                    >
                        {isConnected ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        {isConnected ? 'Disconnect' : 'Start Monitoring'}
                    </button>

                    {isConnected ? (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[#4ec9b0]">
                            <div className="w-2 h-2 rounded-full bg-[#4ec9b0] animate-pulse"></div>
                            <span>Monitoring Active</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 justify-center text-[11px] text-[#969696]">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span>Disconnected</span>
                        </div>
                    )}
                </div>
            </div>

            {/* CRC Settings - Only show for Serial? Yes for now. */}
            <div className="border-t border-[var(--vscode-border)] mt-2 flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 text-[11px] font-bold tracking-wide uppercase flex justify-between items-center bg-[#252526] border-b border-[var(--vscode-border)] shrink-0">
                    <span>CRC Settings</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-4 overflow-y-auto">
                    {/* TX CRC */}
                    <div className="flex flex-col gap-2 p-2 bg-[#2d2d2d] rounded">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#4ec9b0]">TX (Send) CRC</span>
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={txCRC.enabled}
                                    onChange={(e) => updateSessionConfig(session.id, { txCRC: { ...txCRC, enabled: e.target.checked } })}
                                />
                                <div className={`w-7 h-4 rounded-full transition-colors relative ${txCRC.enabled ? 'bg-[#007acc]' : 'bg-[#444]'}`}>
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${txCRC.enabled ? 'left-3.5' : 'left-0.5'}`}></div>
                                </div>
                            </label>
                        </div>
                        <div className={`flex flex-col gap-2 ${!txCRC.enabled && 'opacity-50 pointer-events-none'}`}>
                            {/* ... CRC Controls ... */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] text-[#969696]">Algorithm</label>
                                <select
                                    className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none"
                                    value={txCRC.algorithm}
                                    onChange={(e) => updateSessionConfig(session.id, { txCRC: { ...txCRC, algorithm: e.target.value as any } })}
                                >
                                    <option value="modbus-crc16">Modbus CRC16 (LE)</option>
                                    <option value="ccitt-crc16">CCITT CRC16 (BE)</option>
                                    <option value="crc32">CRC32</option>
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex flex-col gap-1 flex-1">
                                    <label className="text-[10px] text-[#969696]">Start [B]</label>
                                    <input
                                        type="number"
                                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none"
                                        value={txCRC.startIndex}
                                        onChange={(e) => updateSessionConfig(session.id, { txCRC: { ...txCRC, startIndex: Number(e.target.value) } })}
                                    />
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                    <label className="text-[10px] text-[#969696]">End [B]</label>
                                    <select
                                        className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none"
                                        value={txCRC.endIndex}
                                        onChange={(e) => updateSessionConfig(session.id, { txCRC: { ...txCRC, endIndex: Number(e.target.value) } })}
                                    >
                                        <option value={0}>End</option>
                                        <option value={-1}>-1</option>
                                        <option value={-2}>-2</option>
                                        <option value={-3}>-3</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ConfigSidebar = ({ sessionManager }: ConfigSidebarProps) => {
    const { activeSessionId, sessions } = sessionManager;
    const activeSession = sessions.find(s => s.id === activeSessionId);

    if (!activeSession) {
        return (
            <div className="p-4 text-[#969696] text-xs text-center mt-10">
                No active session.<br />
                Click '+' in the editor area to create one.
            </div>
        );
    }

    if (activeSession.config.type === 'mqtt') {
        return (
            <MqttConfigPanel
                config={activeSession.config as MqttSessionConfig}
                isConnected={activeSession.isConnected}
                onUpdate={(updates) => sessionManager.updateSessionConfig(activeSession.id, updates)}
                onConnectToken={() => sessionManager.connectSession(activeSession.id)}
                onDisconnectToken={() => sessionManager.disconnectSession(activeSession.id)}
            />
        );
    }

    // Default to Serial
    return <SerialConfigPanel session={activeSession} sessionManager={sessionManager} />;
};
