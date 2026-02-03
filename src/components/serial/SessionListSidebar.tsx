import { useState, useEffect, useRef } from 'react';
import { FolderOpen, Plus, Trash2, Edit2, Network, Cpu } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { NewSessionDialog } from '../session/NewSessionDialog';
import { SessionType } from '../../types/session';

interface SessionListSidebarProps {
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SessionListSidebar = ({ sessionManager, editorLayout }: SessionListSidebarProps) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, sessionId: string } | null>(null);
    const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
    const addButtonRef = useRef<HTMLDivElement>(null);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const handleSelectSessionType = (type: SessionType) => {
        setShowNewSessionDialog(false);
        const newId = sessionManager.createSession(type); // Promise<string>

        // Handle promise to open
        newId.then(id => {
            const newSession = sessionManager.sessions.find(s => s.id === id);
            if (newSession) {
                // Auto-save happens in createSession now generally, but let's ensure naming or edit mode
                setEditingId(id);
                setEditName(newSession.config.name);
                editorLayout.openSession(id);
            }
        });
    };

    const startEditing = (session: typeof sessionManager.savedSessions[0]) => {
        setEditingId(session.id);
        setEditName(session.name);
        setContextMenu(null);
    };

    const saveEdit = () => {
        if (editingId) {
            console.log(`[Sidebar] Saving rename for ${editingId} to "${editName}"`);
            const session = sessionManager.savedSessions.find(s => s.id === editingId);
            if (session && editName.trim() !== '') {
                const isOpen = sessionManager.sessions.some(s => s.id === editingId);
                if (isOpen) {
                    sessionManager.updateSessionConfig(editingId, { name: editName });
                } else {
                    const updatedConfig = { ...session, name: editName };
                    sessionManager.saveSession(updatedConfig);
                }
            }
            setEditingId(null);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
    };

    const getIconForType = (type: SessionType) => {
        switch (type) {
            case 'mqtt': return <Network size={14} />;
            case 'serial': return <Cpu size={14} />;
            default: return <FolderOpen size={14} />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--vscode-sidebar)] text-[var(--vscode-fg)] relative">
            <div className="h-[30px] px-4 flex items-center justify-end border-b border-[var(--vscode-border)] bg-[var(--vscode-sidebar)]">
                <div
                    ref={addButtonRef}
                    className="cursor-pointer text-[var(--vscode-fg)] hover:text-white p-1 rounded hover:bg-[var(--vscode-list-hover)]"
                    title="New Session"
                    onClick={() => setShowNewSessionDialog(true)}
                >
                    <Plus size={16} />
                </div>
            </div>
            <div className="flex flex-col flex-1 overflow-y-auto" onClick={() => setEditingId(null)}>
                {sessionManager.savedSessions.length === 0 && (
                    <div className="p-4 text-[11px] text-[#858585] italic text-center">
                        No saved sessions.<br />Click '+' to create one.
                    </div>
                )}
                {sessionManager.savedSessions.filter(s => s.type !== 'settings').map(session => (
                    <div
                        key={session.id}
                        className={`px-4 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center gap-2 group border-l-2 ${sessionManager.activeSessionId === session.id ? 'border-[var(--vscode-accent)] bg-[var(--vscode-list-active)]' : 'border-transparent'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (editingId !== session.id) {
                                sessionManager.openSavedSession(session);
                                editorLayout.openSession(session.id);
                            }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, session.id)}
                        title="Click to open, Right-click for options"
                    >
                        <span className={`${session.type === 'mqtt' ? 'text-[#4ec9b0]' : 'text-[#e8b575]'}`}>
                            {getIconForType(session.type)}
                        </span>

                        {editingId === session.id ? (
                            <input
                                autoFocus
                                className="bg-[var(--vscode-input-bg)] text-[13px] text-[var(--vscode-input-fg)] border border-[var(--vscode-focusBorder)] outline-none flex-1 min-w-0"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={saveEdit}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit();
                                    if (e.key === 'Escape') setEditingId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <div className="flex flex-col overflow-hidden flex-1">
                                <span className="truncate font-medium">{session.name}</span>
                                <span className="text-[10px] text-[#858585] truncate">
                                    {session.type === 'serial' ? `${(session as any).connection?.path || 'No Port'}` : (session as any).brokerUrl || session.type}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {showNewSessionDialog && (
                <NewSessionDialog
                    onSelect={handleSelectSessionType}
                    onClose={() => setShowNewSessionDialog(false)}
                    position={{
                        x: (addButtonRef.current?.getBoundingClientRect().left || 0) + 20,
                        y: (addButtonRef.current?.getBoundingClientRect().top || 0) + 20
                    }}
                />
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-[var(--vscode-bg)] border border-[var(--vscode-widget-border)] shadow-lg rounded py-1 w-[120px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div
                        className="px-3 py-1.5 text-[12px] hover:bg-[var(--vscode-list-hover)] hover:text-white cursor-pointer"
                        onClick={() => {
                            const session = sessionManager.savedSessions.find(s => s.id === contextMenu.sessionId);
                            if (session) startEditing(session);
                        }}
                    >
                        Rename
                    </div>
                    <div
                        className="px-3 py-1.5 text-[12px] hover:bg-[var(--vscode-list-hover)] hover:text-white cursor-pointer text-red-400"
                        onClick={() => {
                            const session = sessionManager.savedSessions.find(s => s.id === contextMenu.sessionId);
                            if (session && confirm(`Delete session '${session.name}'?`)) {
                                sessionManager.deleteSession(session.id);
                            }
                        }}
                    >
                        Delete
                    </div>
                </div>
            )}
        </div>
    );
};
