import { useState, useEffect, useRef } from 'react';
import { FolderOpen, Plus, Trash2, Edit2, Network, Cpu } from 'lucide-react';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { NewSessionDialog } from '../session/NewSessionDialog';
import { SessionType } from '../../types/session';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SessionListItem } from './SessionListItem';

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

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = sessionManager.savedSessions.findIndex((s) => s.id === active.id);
            const newIndex = sessionManager.savedSessions.findIndex((s) => s.id === over?.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(sessionManager.savedSessions, oldIndex, newIndex);
                sessionManager.reorderSessions(newOrder);
            }
        }
    };

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
                <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    sensors={sensors}
                >
                    <SortableContext
                        items={sessionManager.savedSessions.filter(s => s.type !== 'settings').map(s => s.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {sessionManager.savedSessions.filter(s => s.type !== 'settings').map(session => (
                            <SessionListItem
                                key={session.id}
                                session={session}
                                isActive={sessionManager.activeSessionId === session.id}
                                isEditing={editingId === session.id}
                                editName={editName}
                                onEditNameChange={setEditName}
                                onSaveEdit={saveEdit}
                                onCancelEdit={() => setEditingId(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingId !== session.id) {
                                        sessionManager.openSavedSession(session);
                                        editorLayout.openSession(session.id);
                                    }
                                }}
                                onContextMenu={(e) => handleContextMenu(e, session.id)}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
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
