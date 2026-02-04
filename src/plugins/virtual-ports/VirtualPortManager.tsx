import { useState, useEffect, useMemo } from 'react';
import { Cable, Plus, Monitor, Network, PlusCircle, Trash2, Globe, AlertTriangle, Download, RefreshCw, Settings } from 'lucide-react';
import { virtualPortService } from './VirtualPortService';
import { useSession } from '../../context/SessionContext';

interface VirtualPortManagerProps {
    editorLayout?: any;
    onNavigate?: (view: string) => void;
}

type PortType = 'serial' | 'tcp';

export const VirtualPortManager = ({ editorLayout }: VirtualPortManagerProps) => {
    const { createSession, ports, sessions } = useSession();

    // --- State ---
    const [portType, setPortType] = useState<PortType>('serial');

    // Serial (com0com) State
    // @ts-ignore
    const [externalPorts, setExternalPorts] = useState<import('./Com0ComService').ExternalPort[]>([]);
    const [com0comAvailable, setCom0comAvailable] = useState(false);
    const [newPublicPort, setNewPublicPort] = useState('COM20');

    // TCP State
    const [tcpPorts, setTcpPorts] = useState<{ port: number, active: boolean }[]>([]);
    const [newTcpPort, setNewTcpPort] = useState('8888');

    // Common
    const [isBusy, setIsBusy] = useState(false);

    // --- Effects ---

    // Initial check for Com0Com
    useEffect(() => {
        checkCom0Com();
    }, []);

    const checkCom0Com = async () => {
        const { com0comService } = await import('./Com0ComService');
        const av = await com0comService.checkAvailability();
        setCom0comAvailable(av);
        if (av) {
            const list = await com0comService.listExternalPorts();
            setExternalPorts(list);
        }
    };

    // --- Helpers ---

    const isPortOpen = (path: string) => {
        return sessions.some(s =>
            s.isConnected &&
            s.config.type === 'serial' &&
            s.config.connection.path === path
        );
    };

    // Physical Ports
    const physicalPorts = useMemo(() => {
        return ports
            .filter(p => !virtualPortService.isVirtualPort(p.path))
            .sort((a, b) => {
                const numA = parseInt(a.path.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.path.replace(/\D/g, '')) || 0;
                return numA - numB;
            });
    }, [ports]);

    // --- Actions ---

    // 1. Install Driver (Mocked for now, will implement logic later)
    const handleInstallDriver = async () => {
        setIsBusy(true);
        const { com0comService } = await import('./Com0ComService');
        try {
            const res = await com0comService.installDriver();
            if (res.success) {
                alert("Driver installation initiated. Please check for User Account Control (UAC) prompts or installation windows.");
                setTimeout(checkCom0Com, 5000);
            } else {
                alert(`Installation failed: ${res.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            alert(`Error invoking install: ${e.message}`);
        }
        setIsBusy(false);
    };

    // 2. Create Serial Port
    const handleCreateSerialPort = async () => {
        setIsBusy(true);
        const { com0comService } = await import('./Com0ComService');
        const success = await com0comService.createVirtualPort(newPublicPort);
        if (success) {
            const list = await com0comService.listExternalPorts();
            setExternalPorts(list);
        } else {
            alert('Failed to create port. Ensure setupc is in PATH or run as Admin.');
        }
        setIsBusy(false);
    };

    const handleRemoveSerialPort = async (pairId: number) => {
        setIsBusy(true);
        const { com0comService } = await import('./Com0ComService');
        await com0comService.removePair(pairId);
        const list = await com0comService.listExternalPorts();
        setExternalPorts(list);
        setIsBusy(false);
    };

    // 3. Create TCP Port
    const handleCreateTcpPort = async () => {
        // TODO: Implement TcpPortService
        const port = parseInt(newTcpPort);
        if (isNaN(port)) return;

        setTcpPorts(prev => [...prev, { port, active: true }]);
        // await tcpService.listen(port);
    };

    const handleRemoveTcpPort = (port: number) => {
        setTcpPorts(prev => prev.filter(p => p.port !== port));
        // await tcpService.close(port);
    };

    // 4. Graph
    const handleOpenGraphSession = async () => {
        const existing = sessions.find(s => s.config.type === 'graph');
        if (existing && editorLayout) {
            editorLayout.openSession(existing.id);
        } else {
            const newId = await createSession('graph', { name: 'Graph Editor' });
            if (newId && editorLayout) editorLayout.openSession(newId);
        }
    };

    const addToGraph = (path: string) => {
        // ... existing add to graph logic
        // For serial: path is Internal Name (CNCBx)
        // For TCP: path is "tcp://localhost:8888" ?

        const currentGraph = virtualPortService.getGraph();
        if (currentGraph.nodes.some(n => n.portPath === path)) return;

        const newNode = {
            id: `node-${Date.now()}`,
            type: 'physical',
            portPath: path,
            position: { x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 }
        };

        // @ts-ignore
        virtualPortService.updateGraph([...currentGraph.nodes, newNode], currentGraph.edges);
    };

    // --- Render ---

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">

            {/* Header */}
            <div className="px-5 py-3 text-xs font-bold text-[var(--vscode-fg)] opacity-60 uppercase tracking-wide flex justify-between items-center">
                <span>Resource Palette</span>
                <div className="flex items-center gap-1">
                    <button onClick={handleOpenGraphSession} title="Open Graph" className="p-1 hover:text-white"><Network size={14} /></button>
                    <button onClick={checkCom0Com} title="Refresh" className="p-1 hover:text-white"><RefreshCw size={14} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

                {/* 1. Physical Ports Section */}
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] uppercase font-bold opacity-40 flex items-center gap-1">
                        <Monitor size={12} /> Physical Ports
                    </div>
                    {physicalPorts.length === 0 ? (
                        <div className="text-[10px] opacity-40 italic pl-2">None found</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {physicalPorts.map(p => {
                                const isOpen = isPortOpen(p.path);
                                return (
                                    <div key={p.path} className="flex flex-col p-2 bg-[#252526] border border-[#3c3c3c] rounded gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono font-bold text-[#4ec9b0] text-xs">{p.path}</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${isOpen ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                                    {isOpen ? 'Busy' : 'Ready'}
                                                </span>
                                                <button onClick={() => addToGraph(p.path)} className="opacity-60 hover:opacity-100 hover:text-white"><PlusCircle size={14} /></button>
                                            </div>
                                        </div>
                                        <div className="text-[10px] opacity-60 truncate" title={p.pnpId || ''}>{p.friendlyName || p.path}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. Virtual Ports Creator Section */}
                <div className="flex flex-col gap-3">
                    <div className="text-[10px] uppercase font-bold opacity-40 flex items-center gap-1">
                        <Cable size={12} /> Create Virtual Port
                    </div>

                    {/* Mode Selector */}
                    <div className="flex bg-[#252526] p-1 rounded border border-[#3c3c3c]">
                        <button
                            onClick={() => setPortType('serial')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] rounded ${portType === 'serial' ? 'bg-[#ce9178] text-white' : 'opacity-60 hover:opacity-100'}`}
                        >
                            <Cable size={12} /> Serial (Driver)
                        </button>
                        <button
                            onClick={() => setPortType('tcp')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] rounded ${portType === 'tcp' ? 'bg-[#4ec9b0] text-[#1e1e1e]' : 'opacity-60 hover:opacity-100'}`}
                        >
                            <Globe size={12} /> TCP / Network
                        </button>
                    </div>

                    {/* Serial Mode UI */}
                    {portType === 'serial' && (
                        <div className="flex flex-col gap-2 p-3 bg-[#252526] border border-[#3c3c3c] rounded relative overflow-hidden">
                            {!com0comAvailable && (
                                <div className="absolute inset-0 bg-[#252526]/90 z-10 flex flex-col items-center justify-center text-center p-4 gap-2">
                                    <AlertTriangle className="text-yellow-500" size={24} />
                                    <div className="text-xs font-bold text-yellow-500">Driver Not Detected</div>
                                    <div className="text-[10px] opacity-70">To use Virtual Serial Ports, the com0com driver is required.</div>
                                    <button
                                        onClick={handleInstallDriver}
                                        disabled={isBusy}
                                        className="mt-2 flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] rounded font-bold"
                                    >
                                        <Download size={12} /> Install Driver
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold opacity-70">PORT NAME</span>
                                <div className="flex items-center gap-1 text-[9px] opacity-50">
                                    <Settings size={10} /> Config
                                </div>
                            </div>
                            {(() => {
                                // Generate candidates COM11-COM50
                                const candidates = Array.from({ length: 40 }, (_, i) => `COM${i + 11}`);
                                // Filter out existing physical ports and active virtual ports
                                const usedPorts = new Set([
                                    ...physicalPorts.map(p => p.path),
                                    ...externalPorts.map(p => p.publicName)
                                ]);

                                return (
                                    <div className="flex gap-2 w-full">
                                        <select
                                            value={newPublicPort}
                                            onChange={e => setNewPublicPort(e.target.value)}
                                            className="flex-1 bg-[#3c3c3c] text-xs p-1.5 rounded border border-[#555] outline-none font-mono text-[#ce9178] appearance-none"
                                        >
                                            {candidates.map(com => (
                                                <option
                                                    key={com}
                                                    value={com}
                                                    disabled={usedPorts.has(com)}
                                                    className={usedPorts.has(com) ? 'opacity-30' : ''}
                                                >
                                                    {com} {usedPorts.has(com) ? '(Used)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleCreateSerialPort}
                                            disabled={!com0comAvailable || isBusy || usedPorts.has(newPublicPort)}
                                            className="px-3 bg-[#ce9178]/20 text-[#ce9178] border border-[#ce9178]/40 rounded hover:bg-[#ce9178] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Create Virtual Port"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                );
                            })()}
                            <div className="text-[9px] opacity-40 leading-tight">
                                Creates a system-wide COM port accessible by Putty, PLC, etc.
                            </div>
                        </div>
                    )}

                    {/* TCP Mode UI */}
                    {portType === 'tcp' && (
                        <div className="flex flex-col gap-2 p-3 bg-[#252526] border border-[#3c3c3c] rounded">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold opacity-70">LOCAL PORT</span>
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="bg-[#3c3c3c] px-2 py-1.5 rounded border border-[#555] text-[10px] opacity-50 font-mono">
                                    127.0.0.1 :
                                </div>
                                <input
                                    type="text"
                                    value={newTcpPort}
                                    onChange={e => setNewTcpPort(e.target.value)}
                                    className="flex-1 bg-[#3c3c3c] text-xs p-1.5 rounded border border-[#555] outline-none font-mono text-[#4ec9b0]"
                                    placeholder="8888"
                                />
                                <button
                                    onClick={handleCreateTcpPort}
                                    className="px-3 bg-[#4ec9b0]/20 text-[#4ec9b0] border border-[#4ec9b0]/40 rounded hover:bg-[#4ec9b0] hover:text-[#1e1e1e] transition-colors"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <div className="text-[9px] opacity-40 leading-tight">
                                Creates a TCP Server. External apps connect as TCP Client to localhost.
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Active Virtual Ports List */}
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] uppercase font-bold opacity-40 flex items-center gap-1">
                        {portType === 'serial' ? <Cable size={12} /> : <Globe size={12} />}
                        Active {portType === 'serial' ? 'Serial' : 'Network'} Ports
                    </div>

                    {portType === 'serial' ? (
                        externalPorts.length === 0 ? <div className="text-[10px] opacity-40 italic pl-2">None</div> : (
                            <div className="flex flex-col gap-1">
                                {externalPorts.map((p, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-[#252526] border border-[#3c3c3c] rounded text-xs group">
                                        <div className="flex flex-col">
                                            <div className="flex gap-2 items-center font-mono">
                                                <span className="text-[#ce9178] font-bold">{p.publicName}</span>
                                                <span className="text-[9px] bg-[#ce9178]/10 text-[#ce9178] px-1 rounded border border-[#ce9178]/30">Driver</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                                            <button onClick={() => handleRemoveSerialPort(p.pairId)} className="hover:text-red-400 p-1"><Trash2 size={12} /></button>
                                            <button onClick={() => addToGraph(p.internalName)} className="hover:text-white p-1"><PlusCircle size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        tcpPorts.length === 0 ? <div className="text-[10px] opacity-40 italic pl-2">None</div> : (
                            <div className="flex flex-col gap-1">
                                {tcpPorts.map((p, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-[#252526] border border-[#3c3c3c] rounded text-xs group">
                                        <div className="flex flex-col">
                                            <div className="flex gap-2 items-center font-mono">
                                                <span className="text-[#4ec9b0] font-bold">:{p.port}</span>
                                                <span className="text-[9px] bg-[#4ec9b0]/10 text-[#4ec9b0] px-1 rounded border border-[#4ec9b0]/30">TCP</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                                            <button onClick={() => handleRemoveTcpPort(p.port)} className="hover:text-red-400 p-1"><Trash2 size={12} /></button>
                                            <button onClick={() => addToGraph(`tcp://localhost:${p.port}`)} className="hover:text-white p-1"><PlusCircle size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

            </div>
        </div>
    );
};
