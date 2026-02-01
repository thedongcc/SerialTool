import { type ReactNode, useState } from 'react';
import { X, LayoutTemplate, Plus, Columns } from 'lucide-react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { SerialMonitor } from '../serial/SerialMonitor';
import { MqttMonitor } from '../mqtt/MqttMonitor';
import { MqttSessionConfig } from '../../types/session';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Tab Component ---
interface TabProps {
    label: string;
    active?: boolean;
    unsaved?: boolean;
    onClose: (e: React.MouseEvent) => void;
    onClick: () => void;
    onSplit?: (e: React.MouseEvent) => void;
}

const Tab = ({ label, active, unsaved, onClose, onClick, onSplit }: TabProps) => (
    <div
        onClick={onClick}
        className={`
    h-full px-3 min-w-[120px] max-w-[200px] flex items-center justify-between cursor-pointer border-r border-[var(--vscode-border)] select-none group
    ${active
                ? 'bg-[var(--vscode-bg)] text-[var(--vscode-fg)] border-t-2 border-t-[var(--vscode-accent)]'
                : 'bg-[var(--vscode-editor-widget-bg)] text-[#969696] hover:bg-[var(--vscode-bg)]'
            }
`}
        title={label}
    >
        <div className="flex items-center gap-2 truncate flex-1">
            <span className="text-[13px] truncate">{label}</span>
            {unsaved && <div className="w-2 h-2 rounded-full bg-white opacity-60"></div>}
        </div>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Split Button (optional, strictly mimicking VS Code tabs might not have this inside tab, but useful) */}
            {/* <div className="p-0.5 mr-1 rounded-md hover:bg-[#4a4a4a]" onClick={onSplit} title="Split Editor"><Columns size={12} /></div> */}

            <div
                onClick={onClose}
                className={`p-0.5 rounded-md hover:bg-[var(--vscode-hover)] ${active ? 'opacity-100' : ''} `}>
                <X size={14} />
            </div>
        </div>
    </div>
);

// --- Sortable Tab Wrapper ---
const SortableTab = ({ id, ...props }: TabProps & { id: string }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 999 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="h-full">
            <Tab {...props} />
        </div>
    );
};

// --- Main Editor Area ---

interface EditorAreaProps {
    children?: ReactNode;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
    onShowSettings?: (view: string) => void;
}

export const EditorArea = ({ children, sessionManager, editorLayout, onShowSettings }: EditorAreaProps) => {
    const { sessions, createSession } = sessionManager;
    const { groups, activeGroupId, setActiveGroupId, openSession, closeView, splitGroup, closeGroup, moveView } = editorLayout;

    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // Requires 5px movement to start drag
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
    };

    const handleDragOver = (event: DragOverEvent) => {
        // Optional: Handle visual feedback for cross-container drag
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find source group
        const sourceGroup = groups.find(g => g.views.includes(activeId));
        if (!sourceGroup) return;

        // Find target group (it could be a tab ID or a group ID if dropped on empty space)
        let targetGroup = groups.find(g => g.views.includes(overId));
        let targetGroupId = targetGroup?.id;

        // If dropped on the container itself (empty space or header area which accepts drops)
        // For simplicity, let's assume dropping on a tab for now. 
        // Note: setting "id" of droppable container is key. SortableContext uses items IDs.

        // If targetGroup is found (dropped on another tab)
        if (targetGroup) {
            if (activeId !== overId) {
                // Determine index
                const oldIndex = sourceGroup.views.indexOf(activeId);
                const newIndex = targetGroup.views.indexOf(overId);
                moveView(sourceGroup.id, targetGroup.id, activeId, newIndex);
            }
        } else {
            // Dropped on a group container (if we make group containers droppable)
            // We'd need to check over.data.current or over.id structure.
            // For now, let's just support sorting within same group or moving element to element.
        }
    };

    // Custom drop animation
    const dropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
        }),
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex flex-col bg-[var(--vscode-bg)] overflow-hidden">
                <PanelGroup direction="horizontal">
                    {groups.flatMap((group, index) => {
                        const isActiveGroup = activeGroupId === group.id;

                        const panel = (
                            <Panel key={group.id} minSize={10} order={index} className="flex flex-col min-w-0">
                                {/* Group Header / Tab Bar */}
                                <div
                                    className={`h-[35px] bg-[var(--vscode-editor-widget-bg)] flex items-center overflow-hidden border-b border-[var(--vscode-border)] ${isActiveGroup ? 'border-b-[var(--vscode-accent)]' : ''}`}
                                    onClick={() => setActiveGroupId(group.id)}
                                >
                                    <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide h-full">
                                        <SortableContext items={group.views} strategy={horizontalListSortingStrategy}>
                                            {group.views.map(sessionId => {
                                                const session = sessions.find(s => s.id === sessionId);
                                                // If session deleted but still in view list? Should sanitize.
                                                if (!session) return null; // Or render placeholder?

                                                return (
                                                    <SortableTab
                                                        key={sessionId}
                                                        id={sessionId}
                                                        label={session.config.name || '(Unknown)'}
                                                        active={session.id === group.activeViewId}
                                                        // Group activation is handled by container click, but clicking tab also activates session
                                                        onClick={() => {
                                                            openSession(sessionId, group.id);
                                                            sessionManager.setActiveSessionId(sessionId);
                                                        }}
                                                        onClose={(e) => { e.stopPropagation(); closeView(group.id, sessionId); }}
                                                    />
                                                );
                                            })}
                                        </SortableContext>

                                        {/* Add Tab Button */}
                                        <div
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setActiveGroupId(group.id);
                                                const newId = await createSession();
                                                if (newId) openSession(newId, group.id);
                                            }}
                                            className="h-full px-2 flex items-center justify-center cursor-pointer hover:bg-[var(--vscode-hover)] text-[#969696] hover:text-[var(--vscode-fg)]"
                                            title="New Serial Monitor"
                                        >
                                            <Plus size={16} />
                                        </div>
                                    </div>

                                    {/* Group Actions */}
                                    <div className="flex items-center px-1 gap-1">
                                        <div
                                            className="p-1 hover:bg-[var(--vscode-hover)] rounded cursor-pointer text-[var(--vscode-fg)]"
                                            title="Split Editor Right"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                splitGroup(group.id);
                                            }}
                                        >
                                            <Columns size={14} />
                                        </div>
                                        {groups.length > 1 && (
                                            <div
                                                className="p-1 hover:bg-[var(--vscode-hover)] rounded cursor-pointer text-[var(--vscode-fg)]"
                                                title="Close Group"
                                                onClick={(e) => { e.stopPropagation(); closeGroup(group.id); }}
                                            >
                                                <X size={14} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Group Content */}
                                <div className="flex-1 relative bg-[var(--vscode-bg)]" onClick={() => {
                                    setActiveGroupId(group.id);
                                    if (group.activeViewId) {
                                        sessionManager.setActiveSessionId(group.activeViewId);
                                    }
                                }}>
                                    {group.activeViewId ? (
                                        (() => {
                                            const session = sessions.find(s => s.id === group.activeViewId);
                                            if (!session) return (
                                                <div className="flex items-center justify-center h-full text-[#969696]">
                                                    Session not found or closed.
                                                </div>
                                            );

                                            if (session.config.type === 'mqtt') {
                                                return <MqttMonitor
                                                    session={session as any}
                                                    onShowSettings={onShowSettings}
                                                    onPublish={(topic, payload, qos, retain) => sessionManager.publishMqtt(session.id, topic, payload, { qos, retain })}
                                                />;
                                            }

                                            return <SerialMonitor
                                                session={session}
                                                onShowSettings={onShowSettings}
                                                onSend={(data) => sessionManager.writeToSession(session.id, data)}
                                                onUpdateConfig={(updates) => sessionManager.updateSessionConfig(session.id, updates)}
                                            />;
                                        })()
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none">
                                            <LayoutTemplate size={64} className="mb-4 text-[var(--vscode-fg)]" />
                                            <p className="text-lg">Empty Group</p>
                                        </div>
                                    )}
                                </div>
                            </Panel>
                        );

                        const resizeHandle = index < groups.length - 1 ? (
                            <PanelResizeHandle key={`resize-${index}`} className="w-[1px] bg-[var(--vscode-widget-border)] hover:bg-[var(--vscode-focusBorder)] hover:w-[2px] transition-all cursor-col-resize z-10" />
                        ) : null;

                        return resizeHandle ? [panel, resizeHandle] : [panel];
                    })}
                </PanelGroup>

                {/* Drag Overlay for smooth visuals */}
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeDragId ? (
                        <div className="opacity-80">
                            {/* We need to get label. A bit tricky without access to session here cleanly without loop. */}
                            <div className="h-full px-3 bg-[var(--vscode-editor-widget-bg)] text-[var(--vscode-fg)] border-t-2 border-[var(--vscode-accent)] flex items-center">
                                <span className="text-[13px]">Moving...</span>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};
