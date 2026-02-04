
interface Com0ComConfig {
    id: number;
    CNCA: string;
    CNCB: string;
}

class Com0ComService {
    private available: boolean = false;
    private setupcPath: string = 'setupc'; // Default, assumes in PATH

    constructor() {
        this.checkAvailability();
    }

    public async checkAvailability(): Promise<boolean> {
        try {
            // @ts-ignore
            if (!window.com0comAPI) return false;
            // @ts-ignore
            const result = await window.com0comAPI.exec(`${this.setupcPath} help`);
            this.available = result.success;
            return result.success;
        } catch (e) {
            console.error('Com0Com Setupc not found', e);
            this.available = false;
            return false;
        }
    }

    public async installDriver(): Promise<{ success: boolean; error?: string }> {
        // @ts-ignore
        if (!window.com0comAPI) return { success: false, error: 'API not found' };
        // @ts-ignore
        const result = await window.com0comAPI.installDriver();
        if (result.success) {
            // Update setupc path to the installed location if returned?
            // For now, we rely on PATH or standard location.
            // If the installer puts it in AppData/drivers/com0com, we need to point to it.
            // The IPC returns { success: true, path: ... }
            if (result.path) {
                this.setupcPath = `"${result.path}\\setupc.exe"`; // Quote for spaces
            }
            this.available = true;
        }
        return result;
    }

    public isAvailable() {
        return this.available;
    }

    public async listPairs(): Promise<Com0ComConfig[]> {
        if (!this.available) return [];
        try {
            // @ts-ignore
            const result = await window.com0comAPI.exec(`${this.setupcPath} list`);
            if (!result.success) return [];

            // Output format:
            // CNCA0 PortName=COM10
            // CNCB0 PortName=COM11
            // ...

            const lines = result.stdout.split('\n');
            const pairs: Map<number, Partial<Com0ComConfig>> = new Map();

            lines.forEach((line: string) => {
                const match = line.match(/(CNCA|CNCB)(\d+)\s+PortName=(.+)/);
                if (match) {
                    const type = match[1]; // CNCA or CNCB
                    const id = parseInt(match[2]);
                    const port = match[3].trim();

                    if (!pairs.has(id)) pairs.set(id, {});
                    const pair = pairs.get(id)!;

                    if (type === 'CNCA') pair.CNCA = port;
                    else pair.CNCB = port;
                }
            });


            // ... (removed duplicate export interface)

            const validPairs: Com0ComConfig[] = [];
            pairs.forEach((p, id) => {
                if (p.CNCA && p.CNCB) validPairs.push({ ...p, id } as Com0ComConfig);
            });
            return validPairs;

        } catch (e) {
            console.error(e);
            return [];
        }
    }

    public async createPair(portA: string, portB: string): Promise<boolean> {
        if (!this.available) return false;
        // install PortName=COM# PortName=COM#
        // setupc install PortName=COM11 PortName=COM12
        try {
            // @ts-ignore
            const result = await window.com0comAPI.exec(`${this.setupcPath} install PortName=${portA} PortName=${portB}`);
            return result.success;
        } catch (e) {
            return false;
        }
    }

    public async removePair(portA: string): Promise<boolean> {
        // We need to find the pair Index or ID to remove.
        // Usually `setupc remove 0` removes pair 0.
        // We need to map portA to an ID first.
        try {
            // @ts-ignore
            const result = await window.com0comAPI.exec(`${this.setupcPath} list`);
            if (!result.success) return false;

            // CNCA0 PortName=COM11
            const lines = result.stdout.split('\n');
            let idToRemove = -1;

            for (const line of lines) {
                if (line.includes(`PortName=${portA}`)) {
                    const match = line.match(/(CNCA|CNCB)(\d+)/);
                    if (match) {
                        idToRemove = parseInt(match[2]);
                        break;
                    }
                }
            }

            if (idToRemove !== -1) {
                // @ts-ignore
                const removeRes = await window.com0comAPI.exec(`${this.setupcPath} remove ${idToRemove}`);
                return removeRes.success;
            }
            return false;

        } catch (e) {
            return false;
        }
    }
    public async createVirtualPort(publicName: string): Promise<boolean> {
        // "Single Port" abstraction:
        // User asks for "COM20".
        // We create pair: "COM20" <-> "CNCB20" (Internal)
        // Check if publicName has number
        const numMatch = publicName.match(/\d+/);
        const suffix = numMatch ? numMatch[0] : '0';
        const internalName = `CNCB${suffix}`;

        return this.createPair(publicName, internalName);
    }

    public async listExternalPorts(): Promise<ExternalPort[]> {
        const pairs = await this.listPairs();
        // Filter pairs that look like "COMx" <-> "CNCBx"
        // Or just return all as ExternalPorts if they have at least one COM port?
        // Our convention: portA is Public, portB is Internal (CNCB)

        return pairs.map(p => {
            // Identify which is which. usually the user created one is 'COMxx'.
            // Setupc defines names arbitrarily.
            // Let's assume the one starting with 'COM' is public.
            let publicName = p.CNCA;
            let internalName = p.CNCB;

            if (p.CNCB && p.CNCB.toUpperCase().startsWith('COM')) {
                publicName = p.CNCB;
                internalName = p.CNCA;
            }

            // If both are COM, pick A.
            return {
                publicName: publicName || '?',
                internalName: internalName || '?',
                pairId: p.id
            };
        });
        // Note: The simple parser in listPairs uses arbitrary logic. 
        // Real implementation of listPairs returns Com0ComConfig which doesn't have ID. 
        // I need to fix listPairs to include ID or fix listExternalPorts to re-parse.
        // Let's fix listPairs first/concurrently? 
        // Actually, listPairs implementation in file returns `pairs` map key as ID!
        // Wait, look at line 65: `const pairs: Map<number, ...>`.
        // The return type Com0ComConfig doesn't have ID.
    }
}

export interface ExternalPort {
    publicName: string;
    internalName: string;
    pairId: number;
}


export const com0comService = new Com0ComService();
