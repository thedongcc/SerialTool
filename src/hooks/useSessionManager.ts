import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionState, SessionConfig, LogEntry } from '../types/session';
import { SerialPortInfo } from '../vite-env';
import { applyTXCRC, validateRXCRC } from '../utils/crc';

const MAX_LOGS = 1000;

export const useSessionManager = () => {
    const [sessions, setSessions] = useState<SessionState[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [savedSessions, setSavedSessions] = useState<SessionConfig[]>([]);
    const [ports, setPorts] = useState<SerialPortInfo[]>([]);

    // We'll use a ref to track registered listeners to avoid duplicates/churn
    const registeredSessions = useRef<Set<string>>(new Set());
    const cleanupRefs = useRef(new Map<string, (() => void)[]>());

    // Helper to update a specific session
    const updateSession = useCallback((sessionId: string, updater: (prev: SessionState) => Partial<SessionState>) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                return { ...s, ...updater(s) };
            }
            return s;
        }));
    }, []);

    const addLog = useCallback((sessionId: string, type: LogEntry['type'], data: string | Uint8Array, crcStatus: LogEntry['crcStatus'] = 'none', topic?: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
                const newLogs = [...s.logs, { type, data, timestamp: Date.now(), crcStatus, topic }];
                if (newLogs.length > MAX_LOGS) newLogs.shift();
                return { ...s, logs: newLogs };
            }
            return s;
        }));
    }, []);

    const clearLogs = useCallback((sessionId: string) => {
        updateSession(sessionId, () => ({ logs: [] }));
    }, [updateSession]);

    // --- Serial API Interactions ---

    const listPorts = useCallback(async () => {
        if (!window.serialAPI) return;
        const result = await window.serialAPI.listPorts();
        if (result.success) {
            setPorts(result.ports);
        } else {
            console.error('Failed to list ports:', result.error);
        }
    }, []);

    const connectSession = useCallback(async (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || session.isConnected) return;

        // MQTT Connection
        if (session.config.type === 'mqtt') {
            if (!window.mqttAPI) {
                addLog(sessionId, 'ERROR', 'MQTT API not available (Electron context missing?)');
                return;
            }

            updateSession(sessionId, () => ({ isConnecting: true }));
            const result = await window.mqttAPI.connect(sessionId, session.config);

            if (result.success) {
                updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
                addLog(sessionId, 'INFO', `Connected to ${(session.config as any).host}`);

                // Register Listeners
                const cleanups: (() => void)[] = [];

                cleanups.push(window.mqttAPI.onMessage(sessionId, (topic, payload) => {
                    addLog(sessionId, 'RX', payload, undefined, topic);
                }));

                cleanups.push(window.mqttAPI.onStatus(sessionId, (status) => {
                    if (status === 'disconnected') {
                        updateSession(sessionId, () => ({ isConnected: false }));
                        addLog(sessionId, 'INFO', 'Disconnected (Remote)');
                    }
                }));

                cleanups.push(window.mqttAPI.onError(sessionId, (err) => {
                    addLog(sessionId, 'ERROR', `MQTT Error: ${err}`);
                }));

                cleanupRefs.current.set(sessionId, cleanups);
            } else {
                updateSession(sessionId, () => ({ isConnecting: false }));
                addLog(sessionId, 'ERROR', `Connection failed: ${result.error}`);
            }
            return;
        }

        if (session.config.type && session.config.type !== 'serial') {
            console.warn('Connect not implemented for other non-serial sessions yet');
            return;
        }

        if (!window.serialAPI) return;

        updateSession(sessionId, () => ({ isConnecting: true }));

        const { connection: options } = session.config;
        const result = await window.serialAPI.open(sessionId, options);

        if (result.success) {
            updateSession(sessionId, () => ({ isConnected: true, isConnecting: false }));
            addLog(sessionId, 'INFO', `Connected to ${options.path}`);
        } else {
            updateSession(sessionId, () => ({ isConnecting: false }));
            addLog(sessionId, 'ERROR', `Failed to connect: ${result.error}`);
        }
    }, [sessions, updateSession, addLog]);

    const disconnectSession = useCallback(async (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;

        if (session.config.type === 'serial') {
            if (window.serialAPI) {
                await window.serialAPI.close(sessionId);
            }
        } else if (session.config.type === 'mqtt') {
            if (window.mqttAPI) {
                await window.mqttAPI.disconnect(sessionId);
            }
            // Execute cleanups
            const cleanups = cleanupRefs.current.get(sessionId);
            if (cleanups) {
                cleanups.forEach(c => c());
                cleanupRefs.current.delete(sessionId);
            }
        }

        updateSession(sessionId, () => ({ isConnected: false }));
        addLog(sessionId, 'INFO', 'Disconnected');
    }, [sessions, updateSession, addLog]);

    const writeToSession = useCallback(async (sessionId: string, data: string | number[] | Uint8Array) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;

        if (session.config.type && session.config.type !== 'serial') {
            console.warn('Write not implemented for non-serial sessions yet');
            return;
        }

        if (!window.serialAPI) return;

        // Process data (CRC)
        let rawData: Uint8Array;
        if (typeof data === 'string') {
            rawData = new TextEncoder().encode(data);
        } else if (data instanceof Uint8Array) {
            rawData = data;
        } else {
            rawData = new Uint8Array(data);
        }

        const finalData = applyTXCRC(rawData, session.config.txCRC);
        const result = await window.serialAPI.write(sessionId, finalData);

        if (result.success) {
            // Also validate TX data with RX CRC config if enabled
            const crcStatus = session.config.rxCRC?.enabled
                ? validateRXCRC(finalData, session.config.rxCRC)
                : 'none';
            addLog(sessionId, 'TX', finalData, crcStatus);
        } else {
            addLog(sessionId, 'ERROR', `Write failed: ${result.error}`);
        }
    }, [sessions, updateSession, addLog]);

    const publishMqtt = useCallback(async (sessionId: string, topic: string, payload: string | Uint8Array, options: { qos: 0 | 1 | 2, retain: boolean }) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || !session.isConnected) return;
        if (session.config.type !== 'mqtt') return;
        if (!window.mqttAPI) return;

        // publish
        const result = await window.mqttAPI.publish(sessionId, topic, payload, options);

        if (result.success) {
            const payloadStr = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
            // Log TX
            const newLogs = [...session.logs, {
                type: 'TX',
                data: payload,
                timestamp: Date.now(),
                topic: topic,
                crcStatus: 'none'
            } as LogEntry];
            if (newLogs.length > MAX_LOGS) newLogs.shift();
            updateSession(sessionId, () => ({ logs: newLogs }));
        } else {
            addLog(sessionId, 'ERROR', `Publish failed: ${result.error}`);
        }
    }, [sessions, updateSession]);

    // Mock Incoming Messages for MQTT - DISABLED for clarity
    /*
    useEffect(() => {
        const interval = setInterval(() => {
            sessions.forEach(session => {
                if (session.config.type === 'mqtt' && session.isConnected) {
                    const topics = (session.config as any).topics || [];
                    const topic = topics.length > 0 ? topics[Math.floor(Math.random() * topics.length)] : 'random/topic';
                    const data = `Mock Data ${Math.floor(Math.random() * 1000)}`;
                    
                    addLog(session.id, 'RX', data, undefined, topic);
                }
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [sessions, addLog]);
    */


    // --- Session Management ---

    const createSession = useCallback(async (type: SessionConfig['type'] = 'serial', config?: Partial<SessionConfig>) => {
        const newId = Date.now().toString();

        let baseConfig: SessionConfig;

        if (type === 'mqtt') {
            baseConfig = {
                id: newId,
                name: `MQTT ${savedSessions.filter(s => s.type === 'mqtt').length + 1}`,
                type: 'mqtt',
                autoConnect: false,
                protocol: 'tcp',
                host: 'broker.emqx.io',
                port: 1883,
                clientId: `client-${Math.random().toString(16).substring(2, 8)}`,
                keepAlive: 60,
                cleanSession: true,
                autoReconnect: true,
                connectTimeout: 30,
                topics: [],
                ...config
            } as any;
        } else if (type === 'settings') {
            baseConfig = {
                id: newId,
                name: 'Settings',
                type: 'settings',
                autoConnect: false,
                ...config
            } as any;
        } else {
            // Default to Serial
            baseConfig = {
                id: newId,
                name: `Serial ${savedSessions.filter(s => s.type === 'serial').length + 1}`,
                type: 'serial',
                connection: {
                    path: '',
                    baudRate: 115200,
                    dataBits: 8,
                    stopBits: 1,
                    parity: 'none'
                },
                txCRC: { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: 0 },
                rxCRC: { enabled: false, algorithm: 'modbus-crc16', startIndex: 0, endIndex: -1 },
                autoConnect: false,
                uiState: {
                    inputContent: '',
                    inputMode: 'hex',
                    lineEnding: '\r\n',
                    viewMode: 'hex',
                    filterMode: 'all',
                    encoding: 'utf-8',
                    fontSize: 13,
                    fontFamily: 'mono',
                    showTimestamp: true
                },
                ...config
            } as any;
        }

        const newSession: SessionState = {
            id: newId,
            config: baseConfig,
            isConnected: false,
            isConnecting: false,
            logs: []
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(newId);

        // Persist immediately
        const newSaved = [...savedSessions, baseConfig];
        setSavedSessions(newSaved);
        if (window.sessionAPI) {
            await window.sessionAPI.save(newSaved);
        }

        return newId;
    }, [sessions, savedSessions]);

    const closeSession = useCallback((sessionId: string) => {
        disconnectSession(sessionId); // Ensure disconnected
        setSessions(prev => {
            const newSessions = prev.filter(s => s.id !== sessionId);
            return newSessions;
        });
        if (activeSessionId === sessionId) {
            // Logic to pick next active session is handled in UI usually, but we can do it here too
            // For now simple logic:
            setActiveSessionId(prev => prev === sessionId ? null : prev);
        }
    }, [disconnectSession, activeSessionId]);

    const duplicateSession = useCallback(async (sourceSessionId: string) => {
        const sourceSession = sessions.find(s => s.id === sourceSessionId);
        if (!sourceSession) return null;

        const newId = Date.now().toString();
        const newConfig = {
            ...sourceSession.config,
            id: newId,
            name: `${sourceSession.config.name} (Copy)`
        };

        const newSession: SessionState = {
            id: newId,
            config: newConfig as SessionConfig,
            isConnected: false,
            isConnecting: false,
            logs: [] // 不复制日志，只复制配置和 UI 状态
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(newId);

        // Persist
        const newSaved = [...savedSessions, newConfig as SessionConfig];
        setSavedSessions(newSaved);
        if (window.sessionAPI) {
            await window.sessionAPI.save(newSaved);
        }

        return newId;
    }, [sessions, savedSessions]);

    // --- Global Listeners Setup ---
    // We need to setup listeners for ALL sessions.
    // Since listeners in preload are filtering by ID now, we need to register a listener for each session
    // OR we can make a single listener for all if we change the preload.
    // Given the current preload implementation:
    // onData(connectionId, callback)
    // We should register listeners when a session connects?
    // actually, it's better to register them when session is created, so we catch anything.

    // A better approach for React is to have a side-effect that syncs listeners with sessions.

    // We'll use a ref to track registered listeners to avoid duplicates/churn (moved to top)


    useEffect(() => {
        if (!window.serialAPI) return;

        sessions.forEach(session => {
            if (!registeredSessions.current.has(session.id)) {
                // Register
                const cleanupData = window.serialAPI.onData(session.id, (data) => {
                    // Check RX CRC
                    // We need latest config... careful with closures.
                    // Use a functional state update or ref to get latest config if needed
                    // For now, simpler: we assume this effect runs often effectively or we use refs.
                    // Actually, since CRC config is inside session state, we need access to it.
                    // The best way is to pass the data processing to a localized component or use a ref for the sessions state.

                    // Let's use the functional update pattern which gives us access to latest state
                    setSessions(prev => {
                        const s = prev.find(x => x.id === session.id);
                        if (!s) return prev;
                        const isOk = validateRXCRC(data, s.config.rxCRC);
                        const newLogs = [...s.logs, { type: 'RX', data, timestamp: Date.now(), crcStatus: s.config.rxCRC.enabled ? (isOk ? 'ok' : 'error') : 'none' } as LogEntry];
                        if (newLogs.length > MAX_LOGS) newLogs.shift();
                        return prev.map(x => x.id === session.id ? { ...x, logs: newLogs } : x);
                    });
                });

                const cleanupClosed = window.serialAPI.onClosed(session.id, () => {
                    updateSession(session.id, () => ({ isConnected: false }));
                    addLog(session.id, 'INFO', 'Port closed remotely');
                });

                const cleanupError = window.serialAPI.onError(session.id, (err) => {
                    addLog(session.id, 'ERROR', `Error: ${err}`);
                });

                registeredSessions.current.add(session.id);

                // Cleanup function for this specific session? 
                // Complex in this "all in one" hook.
            }
        });
    }, [sessions.map(s => s.id).join(','), updateSession, addLog]);
    // This dependency array is a bit cheat-y but works for detecting addition of sessions.
    // ideally we have a separate component or hook per session. But global manager is okay for now.

    // --- Persistence ---
    const loadSavedSessions = useCallback(async () => {
        if (!window.sessionAPI) return;
        const result = await window.sessionAPI.load();
        if (result.success && result.data) {
            // Migration: Ensure all loaded sessions have a type and migrate MQTT brokerUrl
            const migrated = result.data.map(s => {
                const session = { ...s, type: s.type || 'serial' };
                if (session.type === 'mqtt' && (session as any).brokerUrl) {
                    const url = (session as any).brokerUrl;
                    const parts = url.split('://');
                    const protocol = parts[0] || 'tcp';
                    const remaining = parts[1] || url;
                    const [host, port] = remaining.split(':');

                    return {
                        ...session,
                        protocol,
                        host,
                        port: parseInt(port) || 1883,
                        autoReconnect: true,
                        connectTimeout: 30
                    };
                }
                return session;
            });
            setSavedSessions(migrated);
        }
    }, []);

    const saveSession = useCallback(async (session: SessionConfig) => {
        if (!window.sessionAPI) return;

        // Check if exists, update or add
        let newSaved = [...savedSessions];
        const idx = newSaved.findIndex(s => s.id === session.id);
        if (idx >= 0) {
            newSaved[idx] = session;
        } else {
            newSaved.push(session);
        }

        const result = await window.sessionAPI.save(newSaved);
        if (result.success) {
            setSavedSessions(newSaved);
            addLog(session.id, 'INFO', `Session saved as ${session.name}`);
        } else {
            console.error('Failed to save session:', result.error);
        }
    }, [savedSessions, addLog]);

    const deleteSession = useCallback(async (sessionId: string) => {
        if (!window.sessionAPI) return;

        const newSaved = savedSessions.filter(s => s.id !== sessionId);
        const result = await window.sessionAPI.save(newSaved);

        if (result.success) {
            setSavedSessions(newSaved);
        } else {
            console.error('Failed to delete session:', result.error);
        }
    }, [savedSessions]);

    // Helpers for UI to open a saved session
    const openSavedSession = useCallback((config: SessionConfig) => {
        // Check if already open
        const existing = sessions.find(s => s.id === config.id);
        if (existing) {
            setActiveSessionId(existing.id);
            return;
        }

        // Create new session state from config
        const newSession: SessionState = {
            id: config.id,
            config: { ...config }, // Clone to avoid mutation issues
            isConnected: false,
            isConnecting: false,
            logs: []
        };

        setSessions(prev => [...prev, newSession]);
        setActiveSessionId(config.id);
    }, [sessions]);

    const updateSessionConfig = useCallback(async (sessionId: string, updates: Partial<SessionConfig>) => {
        console.log(`[SessionManager] Updating config for ${sessionId}`, updates);
        // 1. Update runtime session
        updateSession(sessionId, (prev) => ({ config: { ...prev.config, ...updates } }));

        // 2. Check if it's a saved session and update persistence
        // We use the functional state of savedSessions to ensure we have latest? 
        // Or just use the dependency.
        const session = sessions.find(s => s.id === sessionId);
        const isSaved = savedSessions.some(s => s.id === sessionId);

        if (session && isSaved) {
            const newConfig = { ...session.config, ...updates };
            // We can reuse saveSession logic but saveSession expects full config.
            // Also saveSession updates state.

            // Optimized save:
            const newSaved = savedSessions.map(s => s.id === sessionId ? { ...s, ...updates } : s);
            setSavedSessions(newSaved); // Optimistic update

            if (window.sessionAPI) {
                await window.sessionAPI.save(newSaved);
            }
        }
    }, [sessions, savedSessions, updateSession]);

    const updateUIState = useCallback((sessionId: string, uiStateUpdates: Partial<any>) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session || session.config.type !== 'serial') return;

        const currentUIState = (session.config as any).uiState || {};
        updateSessionConfig(sessionId, {
            uiState: { ...currentUIState, ...uiStateUpdates }
        } as any);
    }, [sessions, updateSessionConfig]);


    // Initial load
    useEffect(() => {
        listPorts();
        loadSavedSessions();
        const interval = setInterval(listPorts, 5000);
        return () => clearInterval(interval);
    }, [listPorts, loadSavedSessions]);



    return {
        sessions,
        activeSessionId,
        setActiveSessionId,
        savedSessions,
        ports,
        createSession,
        duplicateSession,
        closeSession,
        connectSession,
        disconnectSession,
        writeToSession,
        updateSessionConfig, // Use the scoped function
        updateUIState,
        clearLogs,
        publishMqtt,
        listPorts,
        saveSession,
        deleteSession,
        openSavedSession
    };
};
