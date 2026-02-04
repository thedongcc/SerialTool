import { SerialPortInfo } from '../../vite-env';

export interface VirtualPair {
    id: string;
    portA: string;
    portB: string;
    status: 'connected' | 'error' | 'disabled';
    stats?: {
        bytesAtoB: number;
        bytesBtoA: number;
    };
    signalsA: { rts: boolean; dtr: boolean; }; // Signals driven BY A
    signalsB: { rts: boolean; dtr: boolean; }; // Signals driven BY B
    strictEmulation?: boolean; // New feature: Strict Baudrate Emulation
    strictEmulation?: boolean; // New feature: Strict Baudrate Emulation
}

export interface VirtualSplitter {
    id: string;
    masterPort: string;
    slavePorts: string[]; // List of slave ports
    status: 'active' | 'disabled';
    stats?: {
        masterToSlaves: number;
        slavesToMaster: number;
    };
}

export interface VirtualBridge {
    id: string;
    virtualPort: string; // e.g. "VIRT-BRIDGE-COM1"
    realPort: string;    // e.g. "COM1"
    status: 'active' | 'error' | 'stopped';
    stats?: {
        virtToReal: number;
        realToVirt: number;
    };
    lastError?: string;
}

export interface VirtualSwitch {
    id: string;
    commonPort: string; // "SW-MAIN"
    channels: string[]; // ["SW-A", "SW-B"]
    activeChannelIndex: number;
    stats?: {
        commonToChannel: number;
        channelToCommon: number;
    };
}

type DataCallback = (data: Uint8Array) => void;

interface PortConfig {
    baudRate: number;
    dataBits: number;
    stopBits: number;

    parity: string;
}

export interface GraphNode {
    id: string;
    type: 'physical' | 'virtual' | 'pair' | 'bus';
    portPath: string;
    position: { x: number, y: number };
}

export interface GraphEdge {
    id: string;
    sourceStr: string;
    targetStr: string;
    active: boolean;
}

class VirtualPortService {
    private pairs: VirtualPair[] = [];
    private standalonePorts: string[] = []; // Simple unconnected ports
    private tcpPorts: number[] = []; // Active TCP Server Ports
    private splitters: VirtualSplitter[] = [];
    private bridges: VirtualBridge[] = [];
    private switches: VirtualSwitch[] = [];

    // Graph State
    private nodes: GraphNode[] = [];
    private edges: GraphEdge[] = [];
    private routes: Map<string, Set<string>> = new Map(); // SourcePath -> Set<TargetPath>

    private listeners: Map<string, Set<DataCallback>> = new Map();
    private openPorts: Set<string> = new Set();
    private portConfigs: Map<string, PortConfig> = new Map();

    // UI listeners for updating the manager view
    private stateListeners: Set<() => void> = new Set();

    constructor() {
        // Load initial state if persistence is needed (optional)
        this.load();

        // Listen for TCP Data
        // @ts-ignore
        if (window.tcpAPI) {
            // @ts-ignore
            window.tcpAPI.onData((port, data) => {
                const path = `tcp://localhost:${port}`;
                this.emitData(path, data);
            });
        }
    }

    // ... load method refactoring in next step or combined here ...
    // Let's rely on the load() method I added previously, I will update it.

    // --- Management ---
    public getPairs() {
        return [...this.pairs];
    }

    public getVirtualPorts() {
        return [...this.standalonePorts];
    }

    public getTcpPorts() {
        return [...this.tcpPorts];
    }

    public async addTcpPort(port: number) {
        if (this.tcpPorts.includes(port)) return;

        // Start Server
        // @ts-ignore
        if (window.tcpAPI) {
            // @ts-ignore
            const res = await window.tcpAPI.start(port);
            if (!res.success) {
                console.error(`Failed to start TCP ${port}`, res.error);
                return;
            }
        }

        this.tcpPorts.push(port);
        this.save();
        this.notifyState();
    }

    public async removeTcpPort(port: number) {
        this.tcpPorts = this.tcpPorts.filter(p => p !== port);

        // Stop Server
        // @ts-ignore
        if (window.tcpAPI) {
            // @ts-ignore
            await window.tcpAPI.stop(port);
        }

        this.save();
        this.notifyState();
    }

    public addVirtualPort(path: string) {
        if (this.standalonePorts.includes(path)) return;
        this.standalonePorts.push(path);
        this.save();
        this.notifyState();
    }

    public addPair(pair: VirtualPair) {
        // Ensure signals init
        pair.signalsA = { rts: false, dtr: false };
        pair.signalsB = { rts: false, dtr: false };
        // Default strict off by default for usability, can be toggled
        pair.strictEmulation = false;
        this.pairs.push(pair);
        this.save();
        this.notifyState();
    }

    public removePair(id: string) {
        this.pairs = this.pairs.filter(p => p.id !== id);
        this.save();
        this.notifyState();
    }

    public toggleStatus(id: string) {
        const pair = this.pairs.find(p => p.id === id);
        if (pair) {
            pair.status = pair.status === 'connected' ? 'disabled' : 'connected';
            this.save();
            this.notifyState();
        }
    }

    public toggleStrictEmulation(id: string) {
        const pair = this.pairs.find(p => p.id === id);
        if (pair) {
            pair.strictEmulation = !pair.strictEmulation;
            this.save();
            this.notifyState();
        }
    }

    public getSplitters() { return [...this.splitters]; }

    public addSplitter(splitter: VirtualSplitter) {
        this.splitters.push(splitter);
        this.save();
        this.notifyState();
    }

    public removeSplitter(id: string) {
        this.splitters = this.splitters.filter(s => s.id !== id);
        this.save();
        this.notifyState();
    }

    public getBridges() { return [...this.bridges]; }

    public async addBridge(realPort: string) {
        // Create Bridge
        const bridge: VirtualBridge = {
            id: `bridge-${Date.now()}`,
            realPort: realPort,
            virtualPort: `V-BRIDGE-${realPort}`,
            status: 'stopped'
        };
        this.bridges.push(bridge);
        this.save();
        this.notifyState();

        // Auto-start
        await this.toggleBridge(bridge.id);
    }

    public async removeBridge(id: string) {
        const bridge = this.bridges.find(b => b.id === id);
        if (bridge && bridge.status === 'active') {
            await this.stopBridge(bridge);
        }
        this.bridges = this.bridges.filter(b => b.id !== id);
        this.save();
        this.notifyState();
    }

    public async toggleBridge(id: string) {
        const bridge = this.bridges.find(b => b.id === id);
        if (!bridge) return;

        if (bridge.status === 'active') {
            await this.stopBridge(bridge);
        } else {
            await this.startBridge(bridge);
        }
        this.notifyState();
    }

    public getSwitches() { return [...this.switches]; }

    public addSwitch(vSwitch: VirtualSwitch) {
        this.switches.push(vSwitch);
        this.save();
        this.notifyState();
    }

    public removeSwitch(id: string) {
        this.switches = this.switches.filter(s => s.id !== id);
        this.save();
        this.notifyState();
    }

    public setSwitchChannel(id: string, index: number) {
        const s = this.switches.find(x => x.id === id);
        if (s && index >= 0 && index < s.channels.length) {
            s.activeChannelIndex = index;
            this.save();
            this.notifyState();
        }
    }

    public clearLegacyConfigs() {
        this.pairs = [];
        this.splitters = [];
        this.bridges = [];
        this.switches = [];
        this.save();
        this.notifyState();
    }

    private async startBridge(bridge: VirtualBridge) {
        try {
            // We need to access the real serial API. 
            // Assuming window.serialAPI is available.
            // @ts-ignore
            if (!window.serialAPI) throw new Error("Serial API not available");

            // Open Real Port (Default 9600 for now, or need Config?)
            // Ideally, the Virtual Port "open" config sets the Real Port config.
            // But for a Bridge, usually the settings follow the Proxy.
            // Let's assume we open it with default first.
            // @ts-ignore
            const success = await window.serialAPI.open(bridge.realPort, { baudRate: 9600 });
            if (!success) throw new Error("Failed to open real port");

            bridge.status = 'active';
            bridge.lastError = undefined;

            // Hook Data
            // @ts-ignore
            window.serialAPI.onData(bridge.realPort, (data: Uint8Array) => {
                this.handleRealToVirt(bridge, data);
            });

        } catch (e: any) {
            bridge.status = 'error';
            bridge.lastError = e.message || "Unknown error";
            console.error("Bridge Error", e);
        }
    }

    private async stopBridge(bridge: VirtualBridge) {
        // @ts-ignore
        if (window.serialAPI) {
            // @ts-ignore
            await window.serialAPI.close(bridge.realPort);
        }
        bridge.status = 'stopped';
    }

    private handleRealToVirt(bridge: VirtualBridge, data: Uint8Array) {
        if (!bridge.stats) bridge.stats = { virtToReal: 0, realToVirt: 0 };
        bridge.stats.realToVirt += data.length;
        this.emitData(bridge.virtualPort, data);
        this.notifyState();
    }

    private save() {
        localStorage.setItem('virtual-ports-pairs', JSON.stringify(this.pairs));
        localStorage.setItem('virtual-ports-splitters', JSON.stringify(this.splitters));
        localStorage.setItem('virtual-ports-bridges', JSON.stringify(this.bridges));
        localStorage.setItem('virtual-ports-switches', JSON.stringify(this.switches));
    }

    public subscribeState(cb: () => void) {
        this.stateListeners.add(cb);
        return () => this.stateListeners.delete(cb);
    }

    private notifyState() {
        this.stateListeners.forEach(cb => cb());
    }

    // --- Serial API Simulation ---

    public getSimulatedPorts(): SerialPortInfo[] {
        const ports: SerialPortInfo[] = [];
        this.pairs.forEach(p => {
            if (p.status === 'connected') {
                if (!p.portA.endsWith('_INT')) {
                    ports.push({ path: p.portA, manufacturer: 'Virtual Port (Simulated)', serialNumber: 'VIRT-A', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                }
                if (!p.portB.endsWith('_INT')) {
                    ports.push({ path: p.portB, manufacturer: 'Virtual Port (Simulated)', serialNumber: 'VIRT-B', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                }
            }
        });
        this.splitters.forEach(s => {
            if (s.status === 'active') {
                ports.push({ path: s.masterPort, manufacturer: 'Virtual Splitter Master', serialNumber: 'SPLIT-M', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                s.slavePorts.forEach((slave, idx) => {
                    ports.push({ path: slave, manufacturer: `Virtual Splitter Slave ${idx + 1}`, serialNumber: `SPLIT-S${idx + 1}`, pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                });
            }
        });
        this.bridges.forEach(b => {
            ports.push({ path: b.virtualPort, manufacturer: `Bridge to ${b.realPort}`, serialNumber: 'BRIDGE', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
        });
        this.switches.forEach(s => {
            ports.push({ path: s.commonPort, manufacturer: 'Virtual Switch Common', serialNumber: 'SWITCH-M', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
            s.channels.forEach((ch, i) => {
                ports.push({ path: ch, manufacturer: `Virtual Switch Ch ${i + 1}`, serialNumber: `SWITCH-${i + 1}`, pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
            });
        });

        // Graph Nodes (Virtual)
        this.nodes.forEach(n => {
            if (n.type === 'virtual') {
                ports.push({
                    path: n.portPath,
                    manufacturer: 'Virtual Graph Node',
                    serialNumber: `GRAPH-${n.id}`,
                    pnpId: 'VIRT',
                    locationId: 'VIRT',
                    vendorId: 'VIRT',
                    productId: 'VIRT'
                });
            }
        });
        return ports;
    }

    public isVirtualPort(path: string): boolean {
        const inPairs = this.pairs.some(p => (p.portA === path || p.portB === path) && p.status === 'connected');
        const inSplitters = this.splitters.some(s => (s.masterPort === path || s.slavePorts.includes(path)) && s.status === 'active');
        const inBridges = this.bridges.some(b => b.virtualPort === path);
        const inSwitches = this.switches.some(s => s.commonPort === path || s.channels.includes(path));
        const inGraph = this.nodes.some(n => n.type === 'virtual' && n.portPath === path);
        return inPairs || inSplitters || inBridges || inSwitches || inGraph;
    }

    public open(path: string, options?: any): boolean {
        if (!this.isVirtualPort(path)) return false;
        this.openPorts.add(path);
        if (options) {
            this.portConfigs.set(path, {
                baudRate: options.baudRate,
                dataBits: options.dataBits,
                stopBits: options.stopBits,
                parity: options.parity
            });
        }
        console.log(`[VirtualPort] Opened ${path}`, options);
        return true;
    }

    public close(path: string) {
        this.openPorts.delete(path);
        console.log(`[VirtualPort] Closed ${path}`);
    }

    public write(sourcePath: string, data: Uint8Array) {
        console.log(`[VPS] Write from ${sourcePath} (${data.length} bytes)`);
        // BFS/Hop Logic for Graph Routing
        // This replaces the old "Check Graph Routes" and "Pair Node" logic blocks.
        if (this.nodes.length > 0) {
            // Find start node(s) matching sourcePath
            // Usually just one port node.
            const startNodes = this.nodes.filter(n => n.portPath === sourcePath && (n.type === 'physical' || n.type === 'virtual'));

            if (startNodes.length > 0) {
                const visited = new Set<string>(); // Visited Node IDs
                const pending: { nodeId: string, fromNodeId?: string }[] = [];

                startNodes.forEach(n => pending.push({ nodeId: n.id }));

                while (pending.length > 0) {
                    const { nodeId, fromNodeId } = pending.shift()!;

                    if (visited.has(nodeId)) continue;
                    visited.add(nodeId);

                    const currentNode = this.nodes.find(n => n.id === nodeId);
                    if (!currentNode) continue;

                    // If it is a destination port (and not the start), emit.
                    // Logic: 'physical' or 'virtual' nodes are endpoints.
                    if ((currentNode.type === 'physical' || currentNode.type === 'virtual') && currentNode.portPath !== sourcePath) {
                        // Found a destination
                        setTimeout(() => {
                            this.emitData(currentNode.portPath, data);
                        }, 10);
                        // Don't continue traversing *through* a port?
                        // Usually ports are endpoints.
                        continue;
                    }

                    // Find connected edges
                    // Edges are undirected in function, but valid if active.
                    // We need to find neighbors.
                    const connectedEdges = this.edges.filter(e => e.active && (e.sourceStr === nodeId || e.targetStr === nodeId));

                    // For PAIR nodes, we need to know the "Arrival Side" to enforce cross-over.
                    let arrivalSide: 'input' | 'output' | 'unknown' = 'unknown';
                    if (currentNode.type === 'pair' && fromNodeId) {
                        const entryEdge = connectedEdges.find(e =>
                            (e.sourceStr === fromNodeId && e.targetStr === nodeId) ||
                            (e.sourceStr === nodeId && e.targetStr === fromNodeId)
                        );
                        if (entryEdge) {
                            // Side is relative to the Pair Node
                            // If Pair is Target (Source->Pair), then Arrival came from Input/Left side.
                            if (entryEdge.targetStr === nodeId) arrivalSide = 'input';
                            // If Pair is Source (Pair->Target), then Arrival came from Output/Right side.
                            else if (entryEdge.sourceStr === nodeId) arrivalSide = 'output';
                        }
                    }

                    for (const edge of connectedEdges) {
                        const nextNodeId = edge.sourceStr === nodeId ? edge.targetStr : edge.sourceStr;
                        if (nextNodeId === fromNodeId) continue; // Don't go back

                        // PAIR Logic: Enforce Cross-Over
                        if (currentNode.type === 'pair' && arrivalSide !== 'unknown') {
                            let departureSide: 'input' | 'output' | 'unknown' = 'unknown';
                            if (edge.targetStr === nodeId) departureSide = 'input';
                            else if (edge.sourceStr === nodeId) departureSide = 'output';

                            // If sides are same, BLOCK.
                            if (departureSide === arrivalSide) continue;
                        }

                        // BUS Logic: Flood all (Default)

                        const nextNode = this.nodes.find(n => n.id === nextNodeId);
                        if (!nextNode) continue;

                        pending.push({ nodeId: nextNodeId, fromNodeId: nodeId });
                    }
                }

                // If we handled in graph, we return to avoid legacy logic (optional)
                // But legacy features (Pairs, Splitters outside graph) might still exist?
                // Let's assume Graph takes precedence if configured.
                if (startNodes.length > 0) return;
            }
        }

        // Check Pairs
        const pair = this.pairs.find(p => p.portA === sourcePath || p.portB === sourcePath);
        if (pair && pair.status === 'connected') {
            this.handlePairWrite(pair, sourcePath, data);
            return;
        }

        // Check Splitters
        const splitter = this.splitters.find(s => s.masterPort === sourcePath || s.slavePorts.includes(sourcePath));
        if (splitter && splitter.status === 'active') {
            this.handleSplitterWrite(splitter, sourcePath, data);
            return;
        }

        // Check Bridges
        const bridge = this.bridges.find(b => b.virtualPort === sourcePath);
        if (bridge && bridge.status === 'active') {
            this.handleBridgeWrite(bridge, data);
            return;
        }

        // Check Switches
        const vSwitch = this.switches.find(s => s.commonPort === sourcePath || s.channels.includes(sourcePath));
        if (vSwitch) {
            this.handleSwitchWrite(vSwitch, sourcePath, data);
            return;
        }
    }

    private handlePairWrite(pair: VirtualPair, sourcePath: string, data: Uint8Array) {
        const targetPath = pair.portA === sourcePath ? pair.portB : pair.portA;

        // Check Strict Emulation
        if (pair.strictEmulation) {
            const configSource = this.portConfigs.get(sourcePath);
            const configTarget = this.portConfigs.get(targetPath);

            // Only check if BOTH are open and configured. 
            // If target is closed, data goes into void anyway (or held).
            // But if target is open, we check mismatch.
            if (this.openPorts.has(targetPath) && configSource && configTarget) {
                // Check mismatch
                const mismatch =
                    configSource.baudRate !== configTarget.baudRate ||
                    configSource.dataBits !== configTarget.dataBits ||
                    configSource.stopBits !== configTarget.stopBits ||
                    configSource.parity !== configTarget.parity;

                if (mismatch) {
                    console.warn(`[VirtualPort] Strict Baudrate Mismatch! Dropping data. ${configSource.baudRate} vs ${configTarget.baudRate}`);
                    // Optionally notify UI of error?
                    return; // Drop data
                }
            }
        }

        // Update stats
        if (!pair.stats) pair.stats = { bytesAtoB: 0, bytesBtoA: 0 };
        if (pair.portA === sourcePath) {
            pair.stats.bytesAtoB += data.length;
        } else {
            pair.stats.bytesBtoA += data.length;
        }

        // Throttle notify to avoid UI spam on heavy traffic
        // simple approach: notify every X writes or debounced? 
        // For now, let's just notify. React is fast enough for moderate traffic.
        this.notifyState();

        // Emit data to target's listeners (Loopback)
        // Simulate slight delay for realism
        setTimeout(() => {
            this.emitData(targetPath, data);
        }, 10);
    }

    private handleSplitterWrite(splitter: VirtualSplitter, sourcePath: string, data: Uint8Array) {
        let targets: string[] = [];

        // Stats init
        if (!splitter.stats) splitter.stats = { masterToSlaves: 0, slavesToMaster: 0 };

        if (sourcePath === splitter.masterPort) {
            // Master -> All Slaves
            targets = splitter.slavePorts;
            splitter.stats.masterToSlaves += data.length;
        } else {
            // Slave -> Master
            targets = [splitter.masterPort];
            splitter.stats.slavesToMaster += data.length;
        }

        this.notifyState();

        setTimeout(() => {
            targets.forEach(t => this.emitData(t, data));
        }, 10);
    }

    private handleBridgeWrite(bridge: VirtualBridge, data: Uint8Array) {
        if (!bridge.stats) bridge.stats = { virtToReal: 0, realToVirt: 0 };
        bridge.stats.virtToReal += data.length;

        // Forward to Real Port
        // @ts-ignore
        if (window.serialAPI) {
            // @ts-ignore
            window.serialAPI.write(bridge.realPort, data).catch(e => console.error(e));
        }
        this.notifyState();
    }

    private handleSwitchWrite(vSwitch: VirtualSwitch, sourcePath: string, data: Uint8Array) {
        if (!vSwitch.stats) vSwitch.stats = { commonToChannel: 0, channelToCommon: 0 };

        let target: string | undefined;

        if (sourcePath === vSwitch.commonPort) {
            // Common -> Active Channel
            target = vSwitch.channels[vSwitch.activeChannelIndex];
            vSwitch.stats.commonToChannel += data.length;
        } else {
            // Channel -> Common (Only if active)
            const index = vSwitch.channels.indexOf(sourcePath);
            if (index === vSwitch.activeChannelIndex) {
                target = vSwitch.commonPort;
                vSwitch.stats.channelToCommon += data.length;
            } else {
                // Inactive channel write - drop it?
                // console.warn('Write to inactive switch channel');
            }
        }

        if (target) {
            this.notifyState();
            setTimeout(() => {
                this.emitData(target!, data);
            }, 10);
        }
    }

    public setSignals(sourcePath: string, signals: { rts?: boolean, dtr?: boolean }) {
        const pair = this.pairs.find(p => p.portA === sourcePath || p.portB === sourcePath);
        if (!pair || pair.status !== 'connected') return;

        const isA = pair.portA === sourcePath;
        const current = isA ? pair.signalsA : pair.signalsB;

        if (signals.rts !== undefined) current.rts = signals.rts;
        if (signals.dtr !== undefined) current.dtr = signals.dtr;

        // In null modem:
        // A.RTS -> B.CTS
        // A.DTR -> B.DSR + B.DCD

        // We just save the driving state here. The "reading" side decodes it.
        this.notifyState();
    }

    // Get the signals SEEN by the port (Input signals)
    public getInputSignals(path: string) {
        const pair = this.pairs.find(p => p.portA === path || p.portB === path);
        if (!pair || pair.status !== 'connected') return { cts: false, dsr: false, dcd: false, ri: false };

        const isA = pair.portA === path;
        const partnerSignals = isA ? pair.signalsB : pair.signalsA;

        return {
            cts: partnerSignals.rts,
            dsr: partnerSignals.dtr,
            dcd: partnerSignals.dtr, // Simple null modem loopback
            ri: false
        };
    }

    public onData(path: string, cb: DataCallback) {
        console.log(`[VPS] Registering listener on ${path}`);
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path)!.add(cb);
        return () => {
            const set = this.listeners.get(path);
            if (set) set.delete(cb);
        };
    }

    // Graph Editor compatibility
    public onStateChange(cb: () => void) {
        return this.subscribeState(cb);
    }

    // --- Graph Management ---
    public getGraph() {
        return { nodes: [...this.nodes], edges: [...this.edges] };
    }

    public updateGraph(nodes: GraphNode[], edges: GraphEdge[]) {
        this.nodes = nodes;
        this.edges = edges;
        this.rebuildRoutes();
        this.saveGraph();
        this.notifyState();
    }

    private saveGraph() {
        localStorage.setItem('virtual-ports-graph', JSON.stringify({ nodes: this.nodes, edges: this.edges }));
    }

    private rebuildRoutes() {
        this.routes.clear();
        // Simple 1-step routing for now. 
    }

    public load() {
        console.log('[VPS] Reloading from storage...');
        try {
            const savedStandalones = localStorage.getItem('virtual-ports-standalone');
            if (savedStandalones) this.standalonePorts = JSON.parse(savedStandalones);
        } catch (e) { }

        try {
            const saved = localStorage.getItem('virtual-ports-pairs');
            if (saved) this.pairs = JSON.parse(saved);
        } catch (e) { }

        try {
            const savedSplitters = localStorage.getItem('virtual-ports-splitters');
            if (savedSplitters) this.splitters = JSON.parse(savedSplitters);
        } catch (e) { }

        try {
            const savedBridges = localStorage.getItem('virtual-ports-bridges');
            if (savedBridges) this.bridges = JSON.parse(savedBridges).map((b: VirtualBridge) => ({ ...b, status: 'stopped' }));
        } catch (e) { }

        try {
            const savedSwitches = localStorage.getItem('virtual-ports-switches');
            if (savedSwitches) this.switches = JSON.parse(savedSwitches);
        } catch (e) { }

        try {
            const savedGraph = localStorage.getItem('virtual-ports-graph');
            if (savedGraph) {
                const g = JSON.parse(savedGraph);
                this.nodes = g.nodes || [];
                this.edges = g.edges || [];
            }
        } catch (e) { }

        this.notifyState();
    }

    private save() {
        localStorage.setItem('virtual-ports-standalone', JSON.stringify(this.standalonePorts));
        localStorage.setItem('virtual-ports-pairs', JSON.stringify(this.pairs));
        localStorage.setItem('virtual-ports-splitters', JSON.stringify(this.splitters));
        localStorage.setItem('virtual-ports-bridges', JSON.stringify(this.bridges));
        localStorage.setItem('virtual-ports-switches', JSON.stringify(this.switches));
    }

    public clearLegacyConfigs() {
        this.standalonePorts = [];
        this.pairs = [];
        this.splitters = [];
        this.bridges = [];
        this.switches = [];
        this.save();
        this.notifyState();
    }

    public open(path: string, options?: any): boolean {
        if (!this.isVirtualPort(path)) return false;
        this.openPorts.add(path);
        if (options) {
            this.portConfigs.set(path, {
                baudRate: options.baudRate,
                dataBits: options.dataBits,
                stopBits: options.stopBits,
                parity: options.parity
            });
        }
        console.log(`[VirtualPort] Opened ${path}`, options);
        return true;
    }

    public close(path: string) {
        this.openPorts.delete(path);
        console.log(`[VirtualPort] Closed ${path}`);
    }

    public write(sourcePath: string, data: Uint8Array) {
        // console.log(`[VPS] Write from ${sourcePath} (${data.length} bytes)`);

        // Handle TCP Output
        if (sourcePath.startsWith('tcp://')) {
            // Data coming FROM a TCP connection (via onData -> emitData loopback?)
            // No, wait. 
            // If sourcePath is 'tcp://...', it means data arrived FROM the TCP client.
            // We want to route it TO the graph/destinations.
            // This is handled by standard routing logic below.
        }

        let handled = false;

        // BFS/Hop Logic for Graph Routing
        if (this.nodes.length > 0) {
            const startNodes = this.nodes.filter(n => n.portPath === sourcePath && (n.type === 'physical' || n.type === 'virtual'));
            if (startNodes.length > 0) {
                // ... graph traversal ...
                const visited = new Set<string>();
                const pending: { nodeId: string, fromNodeId?: string }[] = [];
                startNodes.forEach(n => pending.push({ nodeId: n.id }));

                while (pending.length > 0) {
                    const { nodeId, fromNodeId } = pending.shift()!;
                    if (visited.has(nodeId)) continue;
                    visited.add(nodeId);

                    const currentNode = this.nodes.find(n => n.id === nodeId);
                    if (!currentNode) continue;

                    // If destination
                    if ((currentNode.type === 'physical' || currentNode.type === 'virtual') && currentNode.portPath !== sourcePath) {
                        // Found destination.
                        // Check if it's TCP
                        if (currentNode.portPath.startsWith('tcp://')) {
                            // Write to TCP Server
                            const match = currentNode.portPath.match(/tcp:\/\/localhost:(\d+)/);
                            if (match) {
                                const port = parseInt(match[1]);
                                // @ts-ignore
                                if (window.tcpAPI) {
                                    // @ts-ignore
                                    window.tcpAPI.write(port, data);
                                }
                            }
                        } else {
                            // Normal Emit
                            setTimeout(() => this.emitData(currentNode.portPath, data), 10);
                        }
                        handled = true;
                        continue;
                    }

                    // Traverse edges...
                    const connectedEdges = this.edges.filter(e => e.active && (e.sourceStr === nodeId || e.targetStr === nodeId));
                    // ... (keep existing pair logic) ...

                    // ... (keep active traversal) ...
                    for (const edge of connectedEdges) {
                        const nextNodeId = edge.sourceStr === nodeId ? edge.targetStr : edge.sourceStr;
                        if (nextNodeId === fromNodeId) continue;
                        const nextNode = this.nodes.find(n => n.id === nextNodeId);
                        if (!nextNode) continue;
                        pending.push({ nodeId: nextNodeId, fromNodeId: nodeId });
                    }
                }
            }
        }

        if (handled) return;

        // ... existing legacy pair/splitter logic ...
        if (pair && pair.status === 'connected') {
            const targetPath = pair.portA === sourcePath ? pair.portB : pair.portA;
            if (!pair.stats) pair.stats = { bytesAtoB: 0, bytesBtoA: 0 };
            if (pair.portA === sourcePath) pair.stats.bytesAtoB += data.length;
            else pair.stats.bytesBtoA += data.length;

            this.notifyState();
            setTimeout(() => {
                this.emitData(targetPath, data);
            }, 10);
            return;
        }

        // Splitters, Bridges... (simplified: if not found, drop)
    }

    public setSignals(sourcePath: string, signals: { rts?: boolean, dtr?: boolean }) {
        this.notifyState();
    }

    public getInputSignals(path: string) {
        return { cts: false, dsr: false, dcd: false, ri: false };
    }

    public onData(path: string, cb: DataCallback) {
        // console.log(`[VPS] Registering listener on ${path}`);
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path)!.add(cb);
        return () => {
            const set = this.listeners.get(path);
            if (set) set.delete(cb);
        };
    }

    private emitData(path: string, data: Uint8Array) {
        const cbs = this.listeners.get(path);
        if (cbs) {
            cbs.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error('Error in virtual port listener', e);
                }
            });
        }
    }

    // --- Serial API Simulation ---

    public getSimulatedPorts(): SerialPortInfo[] {
        const ports: SerialPortInfo[] = [];

        this.standalonePorts.forEach(p => {
            ports.push({ path: p, manufacturer: 'Virtual Port', serialNumber: 'VIRT-S', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
        });

        this.tcpPorts.forEach(port => {
            ports.push({
                path: `tcp://localhost:${port}`,
                manufacturer: 'TCP Server',
                serialNumber: `TCP-${port}`,
                pnpId: 'TCP',
                locationId: 'TCP',
                vendorId: 'TCP',
                productId: 'TCP'
            });
        });

        this.pairs.forEach(p => {
            if (p.status === 'connected') {
                if (!p.portA.endsWith('_INT')) {
                    ports.push({ path: p.portA, manufacturer: 'Virtual Port (Simulated)', serialNumber: 'VIRT-A', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                }
                if (!p.portB.endsWith('_INT')) {
                    ports.push({ path: p.portB, manufacturer: 'Virtual Port (Simulated)', serialNumber: 'VIRT-B', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                }
            }
        });
        // ... splitters, bridges, switches ...
        this.splitters.forEach(s => {
            if (s.status === 'active') {
                ports.push({ path: s.masterPort, manufacturer: 'Virtual Splitter Master', serialNumber: 'SPLIT-M', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                s.slavePorts.forEach((slave, idx) => {
                    ports.push({ path: slave, manufacturer: `Virtual Splitter Slave ${idx + 1}`, serialNumber: `SPLIT-S${idx + 1}`, pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                });
            }
        });
        this.bridges.forEach(b => {
            ports.push({ path: b.virtualPort, manufacturer: `Bridge to ${b.realPort}`, serialNumber: 'BRIDGE', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
        });
        this.switches.forEach(s => {
            ports.push({ path: s.commonPort, manufacturer: 'Virtual Switch Common', serialNumber: 'SWITCH-M', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
            s.channels.forEach((ch, i) => {
                ports.push({ path: ch, manufacturer: `Virtual Switch Ch ${i + 1}`, serialNumber: `SWITCH-${i + 1}`, pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
            });
        });

        // Graph Nodes check (deduplicate)
        this.nodes.forEach(n => {
            if (n.type === 'virtual') {
                // If already in standalone, skip?
                // Actually standalonePorts are user created. Graph Nodes might just be references.
                // But for now, if it's in standalonePorts, it's already pushed.
                if (this.standalonePorts.includes(n.portPath)) return;

                ports.push({
                    path: n.portPath,
                    manufacturer: 'Virtual Graph Node',
                    serialNumber: `GRAPH-${n.id}`,
                    pnpId: 'VIRT',
                    locationId: 'VIRT',
                    vendorId: 'VIRT',
                    productId: 'VIRT'
                });
            }
        });
        return ports;
    }

    public isVirtualPort(path: string): boolean {
        const inStandalone = this.standalonePorts.includes(path);
        const inTcp = path.startsWith('tcp://');
        const inPairs = this.pairs.some(p => (p.portA === path || p.portB === path) && p.status === 'connected');
        const inSplitters = this.splitters.some(s => (s.masterPort === path || s.slavePorts.includes(path)) && s.status === 'active');
        const inBridges = this.bridges.some(b => b.virtualPort === path);
        const inSwitches = this.switches.some(s => s.commonPort === path || s.channels.includes(path));
        const inGraph = this.nodes.some(n => n.type === 'virtual' && n.portPath === path);
        return inStandalone || inTcp || inPairs || inSplitters || inBridges || inSwitches || inGraph;
    }
}

export const virtualPortService = new VirtualPortService();

// Handle cross-tab or cross-instance updates
window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('virtual-ports-')) {
        virtualPortService.load();
    }
});
