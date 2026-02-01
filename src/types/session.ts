import { SerialOpenOptions } from '../vite-env';
import { CRCConfig } from '../utils/crc';

export interface LogEntry {
    type: 'RX' | 'TX' | 'INFO' | 'ERROR';
    data: string | Uint8Array;
    timestamp: number;
    crcStatus?: 'ok' | 'error' | 'none';
    topic?: string;
}

export type SessionType = 'serial' | 'mqtt' | 'tcp' | 'udp' | 'vnc' | 'rdp' | 'ssh' | 'file' | 'ftp' | 'sftp';

export interface BaseSessionConfig {
    id: string;
    name: string;
    type: SessionType;
    autoConnect: boolean;
}

export interface SerialSessionConfig extends BaseSessionConfig {
    type: 'serial';
    connection: SerialOpenOptions;
    txCRC: CRCConfig;
    rxCRC: CRCConfig;
}

export interface MqttSessionConfig extends BaseSessionConfig {
    type: 'mqtt';
    protocol: 'tcp' | 'ws' | 'wss' | 'ssl';
    host: string;
    port: number;
    clientId: string;
    username?: string;
    password?: string;
    keepAlive: number;
    cleanSession: boolean;
    autoReconnect: boolean;
    connectTimeout: number; // seconds
    topics: string[];
}

export type SessionConfig = SerialSessionConfig | MqttSessionConfig;

export interface SessionState {
    id: string; // Same as config.id
    config: SessionConfig;
    isConnected: boolean;
    isConnecting: boolean;
    logs: LogEntry[];
    // We can add more runtime state here
}
