import React, { type ReactNode, useState } from 'react';
import { X, LayoutTemplate, Plus, Columns } from 'lucide-react';
// Use legacy matching imports to ensure compatibility with user's environment
import { Group, Panel, Separator } from 'react-resizable-panels';
import { SerialMonitor } from '../serial/SerialMonitor';
import { MqttMonitor } from '../mqtt/MqttMonitor';
import { VirtualGraphEditor } from '../../plugins/virtual-ports/VirtualGraphEditor';
import { SettingsEditor } from '../settings/SettingsEditor';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout, LayoutNode, LeafNode, findNode } from '../../hooks/useEditorLayout';
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
    DragEndEvent,
    DragOverEvent,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Helpers for Composite IDs (GroupId::SessionId) ---
const getCompositeId = (groupId: string, sessionId: string) => `${groupId}::${sessionId}`;
const parseCompositeId = (id: string): { groupId: string, sessionId: string } | null => {
    if (!id || !id.includes('::')) return null;
    const parts = id.split('::');
    return { groupId: parts[0], sessionId: parts[1] };
};

// --- Icons ---

// --- Components ---



// --- Tab Component ---
interface TabProps {
    label: string;
    active?: boolean;
    unsaved?: boolean;
    onClose: (e: React.MouseEvent) => void;
    onClick: () => void;
}

const Tab = ({ label, active, unsaved, onClose, onClick }: TabProps) => (
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

// --- Group Header ---
interface GroupHeaderProps {
    group: LeafNode;
    isActiveGroup: boolean;
    setActiveGroupId: (id: string) => void;
    children: ReactNode;
}

const GroupHeader = ({ group, isActiveGroup, setActiveGroupId, children }: GroupHeaderProps) => {
    return (
        <div
            className={`relative z-50 flex h-9 bg-[#252526] border-b border-[#2b2b2b] select-none items-center overflow-hidden ${isActiveGroup ? '' : 'opacity-80'}`}
            onMouseDown={() => setActiveGroupId(group.id)}
        >
            {children}
        </div>
    );
};

// --- Drop Zone Overlay ---
const DropZone = ({ id, className, activeClassName }: { id: string, className?: string, activeClassName?: string }) => {
    const { isOver, setNodeRef } = useDroppable({ id });
    const activeClass = activeClassName || 'bg-[var(--vscode-accent)] opacity-20';
    return (
        <div
            ref={setNodeRef}
            className={`${className} transition-colors ${isOver ? activeClass : 'bg-transparent'}`}
        />
    );
};

// --- Header Drop Zone (For empty space in header) ---
const HeaderDropZone = ({ id, children, className }: { id: string, children: ReactNode, className?: string }) => {
    const { isOver, setNodeRef } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`${className}`}
        >
            {children}
        </div>
    );
};

// --- Drop Indicator ---
const DropIndicator = () => (
    <div className="w-[3px] h-full bg-[#007fd4] absolute z-50 pointer-events-none shadow-[0_0_4px_rgba(0,0,0,0.5)] transform -translate-x-1/2" />
);

// --- Group Panel ---
interface GroupPanelProps {
    node: LeafNode;
    isActive: boolean;
    sessions: any[];
    sessionManager: any;
    layoutActions: any;
    onShowSettings?: (view: string) => void;
    activeDragId: string | null;
    dropIndicator: { groupId: string; index: number } | null;
}

const GroupPanel = ({ node, isActive, sessions, sessionManager, layoutActions, onShowSettings, activeDragId, dropIndicator }: GroupPanelProps) => {
    const { setActiveGroupId, openSession, closeView, splitGroup } = layoutActions;

    return (
        <div className="flex flex-col h-full w-full relative group min-w-0" onClick={() => {
            setActiveGroupId(node.id);
            if (node.activeViewId) sessionManager.setActiveSessionId(node.activeViewId);
        }}>
            {/* Drop Indicators */}
            {activeDragId && (
                <>
                    {/* Center: Merge (Full area, subtle highlight) */}
                    <DropZone
                        id={`${node.id}-center`}
                        className="absolute inset-0 z-30"
                        activeClassName="bg-[var(--vscode-accent)] opacity-10 border-2 border-[var(--vscode-focusBorder)]"
                    />
                </>
            )}

            <GroupHeader group={node} isActiveGroup={isActive} setActiveGroupId={setActiveGroupId}>
                <HeaderDropZone id={`${node.id}-header`} className="flex-1 flex items-center overflow-x-auto scrollbar-hide h-full px-1">
                    <SortableContext items={node.views.map(v => getCompositeId(node.id, v))} strategy={horizontalListSortingStrategy}>
                        {node.views.map((viewId, idx) => {
                            const session = sessions.find(s => s.id === viewId);
                            if (!session) return null;
                            const isActive = node.activeViewId === viewId;
                            const compositeId = getCompositeId(node.id, viewId);
                            const showIndicatorBefore = dropIndicator?.groupId === node.id && dropIndicator.index === idx;
                            // Indicator after last element is handled outside map if possible, but map recursion is easier. 
                            // Actually, "index" could be equal to length.
                            // We will handle "before" logic here. "After last" needs a special check relative to this item or after loop.

                            // Better approach: Wrap in Fragment, conditionally show indicator
                            return (
                                <React.Fragment key={compositeId}>
                                    {showIndicatorBefore && <div className="h-full w-[3px] relative flex flex-shrink-0 items-center justify-center overflow-visible z-50 -mr-[1.5px] -ml-[1.5px]"><DropIndicator /></div>}
                                    <SortableTab
                                        id={compositeId}
                                        active={isActive}
                                        label={session.config.name || '(Unknown)'}
                                        onClick={() => {
                                            sessionManager.setActiveSessionId(viewId);
                                            openSession(viewId, node.id);
                                        }}
                                        onClose={(e) => {
                                            e.stopPropagation();
                                            closeView(node.id, viewId);
                                        }}
                                        unsaved={false} // Todo: track saved state
                                    />
                                </React.Fragment>
                            );
                        })}
                        {/* Indicator at the very end */}
                        {dropIndicator?.groupId === node.id && dropIndicator.index === node.views.length && (
                            <div className="h-full w-[3px] relative flex flex-shrink-0 items-center justify-center overflow-visible z-50 -ml-[1.5px]"><DropIndicator /></div>
                        )}
                    </SortableContext>

                    {/* Add Tab */}
                    <div
                        onClick={async (e) => {
                            e.stopPropagation();
                            setActiveGroupId(node.id);
                            const newId = await sessionManager.createSession();
                            if (newId) openSession(newId, node.id);
                        }}
                        className="h-full px-2 flex items-center justify-center cursor-pointer hover:bg-[var(--vscode-hover)] text-[#969696] hover:text-[var(--vscode-fg)]"
                        title="New Serial Monitor"
                    >
                        <Plus size={16} />
                    </div>
                </HeaderDropZone>

                {/* Actions - Only visible if there are tabs */}
                {node.views && node.views.length > 0 && (
                    <div className="flex items-center px-1 gap-1">
                        <div
                            className="p-1 hover:bg-[var(--vscode-hover)] rounded cursor-pointer text-[var(--vscode-fg)]"
                            title="Split Editor Right"
                            onClick={(e) => {
                                e.stopPropagation();
                                splitGroup(node.id, 'horizontal');
                            }}
                        >
                            <Columns size={14} />
                        </div>
                    </div>
                )}
            </GroupHeader>

            {/* Content */}
            <div className="flex-1 relative bg-[var(--vscode-bg)]">
                {node.activeViewId ? (
                    (() => {
                        const session = sessions.find(s => s.id === node.activeViewId);
                        if (!session) return <div className="p-4 text-center text-gray-500">Session not found</div>;

                        if (session.config.type === 'settings') {
                            return <div className="absolute inset-0"><SettingsEditor /></div>;
                        }
                        if (session.config.type === 'graph') {
                            return <div className="absolute inset-0"><VirtualGraphEditor sessionId={session.id} /></div>;
                        }
                        if (session.config.type === 'mqtt') {
                            return <MqttMonitor
                                session={session as any}
                                onShowSettings={onShowSettings}
                                onPublish={(topic, payload, qos, retain) => sessionManager.publishMqtt(session.id, topic, payload, { qos, retain })}
                            />;
                        }
                        return <SerialMonitor
                            key={session.id}
                            session={session}
                            onShowSettings={onShowSettings}
                            onSend={(data) => sessionManager.writeToSession(session.id, data)}
                            onUpdateConfig={(updates) => sessionManager.updateSessionConfig(session.id, updates)}
                            onInputStateChange={(inputState) => sessionManager.updateUIState(session.id, inputState)}
                            onClearLogs={() => sessionManager.clearLogs(session.id)}
                            onConnectRequest={() => {
                                sessionManager.setActiveSessionId(session.id);
                                sessionManager.connectSession(session.id);
                            }}
                        />;
                    })()
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none">
                        <LayoutTemplate size={64} className="mb-4 text-[var(--vscode-fg)]" />
                        <p className="text-lg">Empty Group</p>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Layout Renderer (Recursive) ---
const LayoutRenderer = ({ node, activeGroupId, sessions, sessionManager, layoutActions, onShowSettings, activeDragId, dropIndicator }: any) => {
    if (!node) return null;

    if (node.type === 'split') {
        return (
            <Group
                key={`${node.id}-${node.direction}`}
                id={node.id}
                direction={node.direction}
                className={`h-full w-full ${node.direction === 'vertical' ? '!flex-col' : '!flex-row'}`}
                style={{ display: 'flex' }}
            >
                {node.children.map((child: { id: string }, index: number) => (
                    <React.Fragment key={child.id}>
                        <Panel minSize={10} className="flex flex-col min-w-0 min-h-0">
                            <LayoutRenderer
                                node={child}
                                activeGroupId={activeGroupId}
                                sessions={sessions}
                                sessionManager={sessionManager}
                                layoutActions={layoutActions}
                                onShowSettings={onShowSettings}
                                activeDragId={activeDragId}
                                dropIndicator={dropIndicator}
                            />
                        </Panel>
                        {index < node.children.length - 1 && (
                            <Separator
                                data-direction={node.direction}
                                className={`bg-[var(--vscode-widget-border)] hover:bg-[var(--vscode-focusBorder)] transition-all z-10
                                    ${node.direction === 'vertical'
                                        ? 'h-[1px] hover:h-[2px] w-full'
                                        : 'w-[1px] hover:w-[2px] h-full'
                                    }`}
                            />
                        )}
                    </React.Fragment>
                ))}
            </Group>
        );
    }

    // Leaf
    return (
        <GroupPanel
            node={node}
            isActive={activeGroupId === node.id}
            sessions={sessions}
            sessionManager={sessionManager}
            layoutActions={layoutActions}
            onShowSettings={onShowSettings}
            onShowSettings={onShowSettings}
            activeDragId={activeDragId}
            dropIndicator={dropIndicator}
        />
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
    const { layout, activeGroupId, moveView, splitDrop } = editorLayout;

    // NOTE: We need sessions to find labels
    const { sessions } = sessionManager;

    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ groupId: string, index: number } | null>(null);

    // Keep layout in ref to avoid stale closures in dnd-kit handlers
    const layoutRef = React.useRef(layout);
    layoutRef.current = layout;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Helper to find group by session ID (Legacy, might still be needed for other lookups if any)
    const findGroupWithSession = (node: LayoutNode, sessionId: string): string | null => {
        // ... (existing implementation if needed, but we rely on composite IDs now)
        // Actually, if we use composite IDs strictly for tabs, we might not need this for drag events.
        // But let's keep it safe.
        if (node.type === 'leaf') {
            if (node.views.includes(sessionId)) return node.id;
            return null;
        }
        if (node.type === 'split') {
            for (const c of node.children) {
                const res = findGroupWithSession(c, sessionId);
                if (res) return res;
            }
        }
        return null;
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
        setDropIndicator(null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const overId = over.id as string;

        // 1. Determine Target Group and Insertion Index
        let targetGroupId: string | null = null;

        // Case A: Dropped on a Tab (Composite ID)
        const overParsed = parseCompositeId(overId);
        if (overParsed) {
            targetGroupId = overParsed.groupId;

            // Find index in target group
            const targetNode = findNode(layoutRef.current, targetGroupId) as LeafNode;
            if (targetNode) {
                const hoverIndex = targetNode.views.indexOf(overParsed.sessionId);

                // Active Rect (dragged)
                const activeRect = active.rect.current.translated;
                // Over Rect (target tab)
                const overRect = over.rect; // { left, top, width, height }

                if (overRect) {
                    // Check collision with mouse cursor (activatorEvent) is most reliable for "left/right" half
                    const activator = event.activatorEvent as any;
                    let insertIndex = hoverIndex;

                    if (activator && activator.clientX !== undefined) {
                        const clientX = activator.clientX;
                        const midpoint = overRect.left + (overRect.width / 2);
                        // If cursor is to the right of midpoint, insert AFTER
                        if (clientX > midpoint) {
                            insertIndex = hoverIndex + 1;
                        }
                    }

                    setDropIndicator({ groupId: targetGroupId, index: insertIndex });
                }
            }
        }
        // Case B: Dropped on a DropZone (e.g. Center or Header)
        else {
            if (overId.includes('-center') || overId.includes('-header')) {
                const gId = overId.replace('-center', '').replace('-header', '');
                const targetNode = findNode(layoutRef.current, gId) as LeafNode;
                if (targetNode) {
                    // Default to appending at end
                    setDropIndicator({ groupId: gId, index: targetNode.views.length });
                }
            } else {
                setDropIndicator(null);
            }
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);
        setDropIndicator(null);
        if (!over) return;

        const overId = over.id as string;

        const activeParsed = parseCompositeId(active.id as string);
        if (!activeParsed) return;
        const { groupId: sourceGroupId, sessionId: activeSessionId } = activeParsed;

        // If overId contains -top/bottom/left/right/center (DropZone)
        if (overId.includes('-') && !overId.includes('::')) {
            const parts = overId.split('-');
            const zone = parts.pop();
            const targetGroupId = parts.join('-');

            if (zone === 'center' || zone === 'header') {
                // Determine index? Default to end
                const targetNode = findNode(layoutRef.current, targetGroupId) as LeafNode;
                const idx = targetNode ? targetNode.views.length : 0;
                moveView(sourceGroupId, targetGroupId, activeSessionId, idx);
            } else if (['top', 'bottom', 'left', 'right'].includes(zone!)) {
                splitDrop(sourceGroupId, targetGroupId, activeSessionId, zone as any);
            }
            return;
        }

        // Case: Dropped on a Tab
        const overParsed = parseCompositeId(overId);
        if (overParsed) {
            const targetGroupId = overParsed.groupId;
            const targetNode = findNode(layoutRef.current, targetGroupId) as LeafNode;

            if (targetNode) {
                let targetIndex = targetNode.views.indexOf(overParsed.sessionId);

                // Adjust index based on side (re-calculate or use stored indicator? Indicator state is cleared)
                // We should re-calc using activator event if possible, or reliable rect logic
                const activator = event.activatorEvent as any;
                if (activator && activator.clientX !== undefined) {
                    const clientX = activator.clientX;
                    const overRect = over.rect;
                    const midpoint = overRect.left + (overRect.width / 2);
                    if (clientX > midpoint) {
                        targetIndex += 1;
                    }
                }

                moveView(sourceGroupId, targetGroupId, activeSessionId, targetIndex);
            }
            return;
        }
    };

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
                {layout ? (
                    <LayoutRenderer
                        node={layout}
                        activeGroupId={activeGroupId}
                        sessions={sessions}
                        sessionManager={sessionManager}
                        layoutActions={editorLayout}
                        onShowSettings={onShowSettings}
                        activeDragId={activeDragId}
                        dropIndicator={dropIndicator}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        No Editors Open
                    </div>
                )}

                <DragOverlay dropAnimation={dropAnimation}>
                    {activeDragId ? (
                        <div className="h-full px-3 bg-[var(--vscode-editor-widget-bg)] text-[var(--vscode-fg)] border-t-2 border-[var(--vscode-accent)] flex items-center min-w-[120px] pointer-events-none shadow-lg opacity-90">
                            <span className="text-[13px]">
                                {(() => {
                                    const parsed = parseCompositeId(activeDragId);
                                    const sid = parsed ? parsed.sessionId : activeDragId;
                                    return sessions.find(s => s.id === sid)?.config.name || 'Tab';
                                })()}
                            </span>
                        </div>
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};
