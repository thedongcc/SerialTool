import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { CommandEntity, CommandGroup, CommandItem } from '../types/command';

const STORAGE_KEY = 'serial-tool-commands';

interface CommandContextType {
    commands: CommandEntity[];
    addGroup: (name: string, parentId?: string | null) => void;
    addCommand: (item: Omit<CommandItem, 'id' | 'type'>) => void;
    updateEntity: (id: string, updates: Partial<CommandEntity>) => void;
    deleteEntity: (id: string) => void;
    clearAll: () => void;
    setAllCommands: (newCommands: CommandEntity[]) => void;
    importCommands: () => void;
    exportCommands: () => void;
}

const CommandContext = createContext<CommandContextType | undefined>(undefined);

export const CommandProvider = ({ children }: { children: ReactNode }) => {
    const [commands, setCommands] = useState<CommandEntity[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setCommands(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to load commands', e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save to local storage whenever commands change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
        }
    }, [commands, isLoaded]);

    const addGroup = useCallback((name: string, parentId: string | null = null) => {
        const newGroup: CommandGroup = {
            id: `group-${Date.now()}`,
            type: 'group',
            name,
            parentId,
            isOpen: true
        };
        setCommands(prev => [...prev, newGroup]);
    }, []);

    const addCommand = useCallback((item: Omit<CommandItem, 'id' | 'type'>) => {
        const newCommand: CommandItem = {
            ...item,
            id: `cmd-${Date.now()}`,
            type: 'command'
        };
        setCommands(prev => [...prev, newCommand]);
    }, []);

    const updateEntity = useCallback((id: string, updates: Partial<CommandEntity>) => {
        setCommands(prev => prev.map(item => item.id === id ? { ...item, ...updates } as CommandEntity : item));
    }, []);

    const deleteEntity = useCallback((id: string) => {
        const getDescendants = (parentId: string, list: CommandEntity[]): string[] => {
            const children = list.filter(c => c.parentId === parentId);
            let ids = children.map(c => c.id);
            children.forEach(c => {
                if (c.type === 'group') {
                    ids = [...ids, ...getDescendants(c.id, list)];
                }
            });
            return ids;
        };

        setCommands(prev => {
            const toDelete = new Set([id, ...getDescendants(id, prev)]);
            return prev.filter(c => !toDelete.has(c.id));
        });
    }, []);

    const clearAll = useCallback(() => {
        if (confirm('Are you sure you want to clear all commands?')) {
            setCommands([]);
        }
    }, []);

    const setAllCommands = useCallback((newCommands: CommandEntity[]) => {
        setCommands(newCommands);
    }, []);

    const importCommands = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    if (Array.isArray(imported)) {
                        if (confirm('Merge with existing commands? Cancel to Replace.')) {
                            setCommands(prev => [...prev, ...imported]);
                        } else {
                            setCommands(imported);
                        }
                    } else {
                        alert('Invalid format');
                    }
                } catch (e) {
                    alert('Failed to parse file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, []);

    const exportCommands = useCallback(() => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(commands, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "serial_tool_commands.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }, [commands]);

    const value = {
        commands,
        addGroup,
        addCommand,
        updateEntity,
        deleteEntity,
        clearAll,
        setAllCommands,
        importCommands,
        exportCommands
    };

    return (
        <CommandContext.Provider value={value}>
            {children}
        </CommandContext.Provider>
    );
};

export const useCommandContext = () => {
    const context = useContext(CommandContext);
    if (!context) {
        throw new Error('useCommandContext must be used within a CommandProvider');
    }
    return context;
};
