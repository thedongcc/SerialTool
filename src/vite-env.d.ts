export interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    vendorId?: string;
    productId?: string;
    friendlyName?: string;
}

export interface SerialOpenOptions {
    path: string;
    baudRate: number;
    dataBits?: 5 | 6 | 7 | 8;
    stopBits?: 1 | 1.5 | 2;
    parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
}

export interface SerialAPI {
    listPorts: () => Promise<{ success: boolean; ports: SerialPortInfo[]; error?: string }>;
    open: (connectionId: string, options: SerialOpenOptions) => Promise<{ success: boolean; error?: string }>;
    close: (connectionId: string) => Promise<{ success: boolean; error?: string }>;
    write: (connectionId: string, data: string | number[] | Uint8Array) => Promise<{ success: boolean; error?: string }>;
    onData: (connectionId: string, callback: (data: Uint8Array) => void) => () => void;
    onClosed: (connectionId: string, callback: () => void) => () => void;
    onError: (connectionId: string, callback: (err: string) => void) => () => void;
}

export interface MqttAPI {
    connect: (connectionId: string, config: any) => Promise<{ success: boolean; error?: string }>;
    disconnect: (connectionId: string) => Promise<{ success: boolean; error?: string }>;
    publish: (connectionId: string, topic: string, payload: any, options: any) => Promise<{ success: boolean; error?: string }>;
    subscribe: (connectionId: string, topic: string) => Promise<{ success: boolean; error?: string }>;
    unsubscribe: (connectionId: string, topic: string) => Promise<{ success: boolean; error?: string }>;
    onMessage: (connectionId: string, callback: (topic: string, payload: Uint8Array) => void) => () => void;
    onStatus: (connectionId: string, callback: (status: string) => void) => () => void;
    onError: (connectionId: string, callback: (err: string) => void) => () => void;
}

declare global {
    interface Window {
        ipcRenderer: import('electron').IpcRenderer
        serialAPI: SerialAPI
        mqttAPI: MqttAPI
        sessionAPI: {
            save: (sessions: any[]) => Promise<{ success: boolean; error?: string }>;
            load: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        }
    }
}
