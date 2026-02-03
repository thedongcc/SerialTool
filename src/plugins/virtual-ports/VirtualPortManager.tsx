import { useState, useEffect, useMemo } from 'react';
import { Cable, Plus, Monitor, ArrowRight, Layers, Network, PlusCircle } from 'lucide-react';
import { virtualPortService } from './VirtualPortService';
import { useSession } from '../../context/SessionContext';

interface VirtualPortManagerProps {
    editorLayout?: any;
    onNavigate?: (view: string) => void;
}

export const VirtualPortManager = ({ editorLayout }: VirtualPortManagerProps) => {
    const { createSession, ports, sessions, activeSessionId } = useSession();
    const [pairs, setPairs] = useState(virtualPortService.getPairs());
    const [selectedVirtualCom, setSelectedVirtualCom] = useState('COM1');

    // 1. Physical Ports: Sorted & Status
    const physicalPorts = useMemo(() => {
        return ports
            .filter(p => !virtualPortService.isVirtualPort(p.path))
            .sort((a, b) => {
                // Natural sort: COM1 < COM2 < COM10
                const numA = parseInt(a.path.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.path.replace(/\D/g, '')) || 0;
                return numA - numB;
            });
    }, [ports]);

    // Helper to check if port is open in any active session
    const isPortOpen = (path: string) => {
        return sessions.some(s =>
            s.isConnected &&
            s.config.type === 'serial' &&
            s.config.connection.path === path
        );
    };

    // 2. Virtual Port Options (COM1-COM100 excluding physical)
    const virtualPortOptions = useMemo(() => {
        const used = new Set(physicalPorts.map(p => p.path));
        // Also exclude existing virtual pairs to avoid duplicates if logic requires
        // But for now, user wants "available". 
        // Let's generate COM1..COM100
        const options: string[] = [];
        for (let i = 1; i <= 100; i++) {
            const name = `COM${i}`;
            if (!used.has(name)) {
                options.push(name);
            }
        }
        return options;
    }, [physicalPorts]);

    useEffect(() => {
        const unsub = virtualPortService.subscribeState(() => {
            setPairs(virtualPortService.getPairs());
        });
        return unsub;
    }, []);

    // 3. Singleton Graph Session
    const handleOpenGraphSession = async () => {
        // Check if graph session exists
        const existing = sessions.find(s => s.config.type === 'graph');
        if (existing) {
            if (editorLayout) {
                editorLayout.openSession(existing.id);
            }
        } else {
            const newId = await createSession('graph', {
                name: 'Graph Editor',
            });
            if (newId && editorLayout) {
                editorLayout.openSession(newId);
            }
        }
    };

    const handleCreateVirtualPort = () => {
        if (!selectedVirtualCom) return;

        // Use selected COM as the "Public" side (portA)
        // Internal side uses _INT suffix to be hidden
        const portA = selectedVirtualCom;
        const portB = `${selectedVirtualCom}_INT`;

        // Check if pair with this name already exists
        const exists = virtualPortService.getPairs().some(p => p.portA === portA || p.portB === portA);
        if (exists) return;

        virtualPortService.addPair({
            id: `pair-${Date.now()}`,
            portA,
            portB,
            status: 'connected',
            signalsB: { rts: false, dtr: false }
        });
    };
    const addToGraph = (portPath: string) => {
        // Add a node to the graph
        // We need updates in VirtualPortService to support adding nodes from here
        // Or access the graph state directly.
        // Implemented: updateGraph(nodes, edges).
        const currentGraph = virtualPortService.getGraph();

        // Check if node exists which matches portPath
        if (currentGraph.nodes.some(n => n.portPath === portPath)) return;

        const newNode = {
            id: `node-${Date.now()}`,
            type: 'physical', // or virtual, distinguishing for visual style?
            // Actually check if it's virtual
            // But for graph, it's just a port node
            portPath: portPath,
            position: { x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 }
        };

        // @ts-ignore
        virtualPortService.updateGraph([...currentGraph.nodes, newNode], currentGraph.edges);
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)]">
            {/* Header */}
            <div className="px-5 py-3 text-xs font-bold text-[var(--vscode-fg)] opacity-60 uppercase tracking-wide">
                Resource Palette
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">

                {/* Section: Actions */}
                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleOpenGraphSession}
                        className="flex items-center gap-2 w-full p-2 bg-[#007acc] text-white rounded hover:bg-[#0062a3] transition-colors"
                    >
                        <Network size={16} />
                        <span className="text-xs font-bold">Open Graph View</span>
                    </button>
                    <div className="text-[10px] opacity-60 px-1">
                        Open the visual editor to route data.
                    </div>
                </div>

                {/* Section: Physical Ports */}
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
                                                <button
                                                    onClick={() => addToGraph(p.path)}
                                                    className="opacity-60 hover:opacity-100 hover:text-white"
                                                    title="Add to Graph"
                                                >
                                                    <PlusCircle size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-[10px] opacity-60 truncate" title={p.pnpId || ''}>
                                            {p.path} {p.friendlyName
                                                ? p.friendlyName.replace(`(${p.path})`, '').trim()
                                                : ''}
                                            {(!p.friendlyName && !p.manufacturer) ? '' : (p.manufacturer ? ` (${p.manufacturer})` : '')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Section: Virtual Creation */}
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] uppercase font-bold opacity-40 flex items-center gap-1">
                        <Layers size={12} /> Create Virtual Port
                    </div>
                    <div className="flex gap-2">
                        <select
                            className="flex-1 bg-[#3c3c3c] text-xs p-1.5 rounded border border-[#3c3c3c] outline-none"
                            value={selectedVirtualCom}
                            onChange={e => setSelectedVirtualCom(e.target.value)}
                        >
                            {virtualPortOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleCreateVirtualPort}
                            className="p-1.5 bg-[#252526] border border-[#3c3c3c] rounded hover:bg-[#3c3c3c]"
                            title="Create"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                {/* Section: Active Virtual Pairs */}
                <div className="flex flex-col gap-2">
                    <div className="text-[10px] uppercase font-bold opacity-40 flex items-center gap-1">
                        <Cable size={12} /> Active Virtual Ports
                    </div>
                    {pairs.length === 0 ? (
                        <div className="text-[10px] opacity-40 italic pl-2">None</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {pairs.map(p => {
                                // Only show primary side (portA) if it looks like the user-facing one?
                                // Or we just hide the arrow and B side.
                                // User request: "Normal should only be COM1".
                                // We assume PortA is the "Public" one.
                                return (
                                    <div key={p.id} className="flex items-center justify-between p-2 bg-[#252526] border border-[#3c3c3c] rounded text-xs">
                                        <div className="flex gap-1 items-center font-mono">
                                            <span className="text-[#ce9178] font-bold">{p.portA}</span>
                                            <span className="text-[9px] opacity-40 italic ml-2">(Virtual)</span>
                                        </div>
                                        <button
                                            onClick={() => addToGraph(p.portA)}
                                            className="opacity-60 hover:opacity-100 hover:text-white"
                                            title={`Add ${p.portA} to Graph`}
                                        >
                                            <PlusCircle size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
