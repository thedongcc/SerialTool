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
    type: 'physical' | 'virtual';
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
        const saved = localStorage.getItem('virtual-ports-pairs');
        if (saved) {
            try {
                this.pairs = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load virtual ports', e);
            }
        }
        const savedSplitters = localStorage.getItem('virtual-ports-splitters');
        if (savedSplitters) {
            try { this.splitters = JSON.parse(savedSplitters); } catch (e) { console.error(e); }
        }
        const savedBridges = localStorage.getItem('virtual-ports-bridges');
        if (savedBridges) {
            // Invalidate status on reload (can't assume real port is still open/valid)
            try {
                this.bridges = JSON.parse(savedBridges).map((b: VirtualBridge) => ({ ...b, status: 'stopped' }));
            } catch (e) { console.error(e); }
        }
        const savedSwitches = localStorage.getItem('virtual-ports-switches');
        if (savedSwitches) {
            try { this.switches = JSON.parse(savedSwitches); } catch (e) { console.error(e); }
        }

        const savedGraph = localStorage.getItem('virtual-ports-graph');
        if (savedGraph) {
            try {
                const g = JSON.parse(savedGraph);
                this.nodes = g.nodes || [];
                this.edges = g.edges || [];
                // this.rebuildRoutes(); // Cant call method in constructor if it depends on fully init? 
                // Actually it is fine if methods are defined. But rebuildRoutes is defined later.
                // JS classes hoist methods.
                // However, let's keep it safe.
            } catch (e) { console.error(e); }
            this.rebuildRoutes();
        }
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
        // For A -> B -> C (multi-hop), we might need BFS/DFS if we want deep forwarding.
        // But typically serial forwarding is direct. 
        // If A -> B and B -> C, typically checking B's write handler forwards to C.
        // But here `write` is called on A.
        // If we want Multi-hop, we need to trace the path.
        // Let's implement full transitive closure or just recursive lookup in `write`.

        // Actually, easiest is to just build adjacency list here.
        // Then in `write`, we traverse.
        // But to avoid loops, we need cycle detection in `write`.

        // For performance, let's just store the Edges in a Map for quick lookup.
        // Logic will be in `write`.
    }

    // --- Management ---
    public getPairs() {
        return [...this.pairs];
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
                ports.push({ path: p.portA, manufacturer: 'Virtual Port (Simulated)', serialNumber: 'VIRT-A', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
                ports.push({ path: p.portB, manufacturer: 'Virtual Port (Simulated)', serialNumber: 'VIRT-B', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
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
            // We always expose the Virtual side, even if bridge is stopped (it just won't work)
            // or maybe only if active?
            ports.push({ path: b.virtualPort, manufacturer: `Bridge to ${b.realPort}`, serialNumber: 'BRIDGE', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
        });
        this.switches.forEach(s => {
            ports.push({ path: s.commonPort, manufacturer: 'Virtual Switch Common', serialNumber: 'SWITCH-M', pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
            s.channels.forEach((ch, i) => {
                ports.push({ path: ch, manufacturer: `Virtual Switch Ch ${i + 1}`, serialNumber: `SWITCH-${i + 1}`, pnpId: 'VIRT', locationId: 'VIRT', vendorId: 'VIRT', productId: 'VIRT' });
            });
        });
        return ports;
    }

    public isVirtualPort(path: string): boolean {
        const inPairs = this.pairs.some(p => (p.portA === path || p.portB === path) && p.status === 'connected');
        const inSplitters = this.splitters.some(s => (s.masterPort === path || s.slavePorts.includes(path)) && s.status === 'active');
        const inBridges = this.bridges.some(b => b.virtualPort === path);
        const inSwitches = this.switches.some(s => s.commonPort === path || s.channels.includes(path));
        return inPairs || inSplitters || inBridges || inSwitches;
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
        // Check Graph Routes
        const destinations = new Set<string>();
        const visited = new Set<string>();
        const queue = [sourcePath];
        visited.add(sourcePath);

        // BFS to find all reachable ports
        while (queue.length > 0) {
            const current = queue.shift()!;

            // Find connected nodes where source == current
            const sourceNode = this.nodes.find(n => n.portPath === current);
            if (!sourceNode) continue;

            const outgoingEdges = this.edges.filter(e => e.sourceStr === sourceNode.id && e.active);

            for (const edge of outgoingEdges) {
                const targetNode = this.nodes.find(n => n.id === edge.targetStr);
                if (targetNode && !visited.has(targetNode.portPath)) {
                    visited.add(targetNode.portPath);
                    destinations.add(targetNode.portPath);
                    queue.push(targetNode.portPath); // Continue BFS
                }
            }
        }

        if (destinations.size > 0) {
            // console.log(`[VPS] Graph Switch: ${sourcePath} -> ${Array.from(destinations).join(', ')}`);
            destinations.forEach(dest => {
                // Prevent creating loop back to source in simple 1-1 cases if needed, 
                // but BFS handles loops by `visited` set.
                // However, we shouldn't emit back to self usually? 
                // Serial ports usually don't echo unless local echo is on.
                if (dest !== sourcePath) {
                    setTimeout(() => {
                        this.emitData(dest, data);
                    }, 10);
                }
            });
            // If we matched graph routes, should we return? 
            // Or allow legacy modes too?
            // Let's return to prioritize graph.
            return;
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

    public subscribeState(cb: () => void) {
        this.stateListeners.add(cb);
        return () => { this.stateListeners.delete(cb); };
    }

    private notifyState() {
        this.stateListeners.forEach(cb => cb());
    }

    private emitData(path: string, data: Uint8Array) {
        const cbs = this.listeners.get(path);
        console.log(`[VPS] Emit to ${path} (${data.length} bytes). Listeners: ${cbs?.size || 0}`);
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
}

export const virtualPortService = new VirtualPortService();
