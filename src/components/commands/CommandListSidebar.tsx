import { Plus, FolderPlus, Upload, Trash2, MoreHorizontal, FileText, Folder, Play, CornerDownLeft } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useCommandManager } from '../../hooks/useCommandManager';
import { CommandList } from './CommandList';
import { CommandEntity, CommandItem } from '../../types/command';
import { CommandEditorDialog } from './CommandEditorDialog';
import { useSession } from '../../context/SessionContext';
import { parseDOM, compileSegments, parseHex } from '../../utils/InputParser';
import { ContextMenu } from '../common/ContextMenu';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter, CollisionDetection, pointerWithin, rectIntersection, useDroppable } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { CommandProvider } from '../../context/CommandContext';

// Helper component for the scrollable list area
// This needs to be a separate component so it can validly consume useDroppable context from DndContext
const CommandScrollArea = ({
    items,
    onEdit,
    onSend,
    onContextMenu,
    canSend
}: {
    items: CommandEntity[];
    onEdit: (item: CommandEntity) => void;
    onSend: (item: CommandItem) => void;
    onContextMenu: (e: React.MouseEvent, item: CommandEntity) => void;
    canSend: boolean;
}) => {
    // 1. Root Drop Hook (Catches drags to empty space)
    const { setNodeRef: setRootDropRef, isOver, active } = useDroppable({
        id: 'root-drop',
        data: { type: 'root' }
    });

    // 2. Visual Logic: Show line if we are dragging something over the root zone
    // `active` is non-null when dragging. `isOver` is true when pointer is over this div.
    const showLine = isOver && active;

    return (
        <div
            ref={setRootDropRef}
            className="flex-1 overflow-y-auto p-1 min-h-0 relative"
        >
            <CommandList
                items={items}
                onEdit={onEdit}
                onSend={onSend}
                onContextMenu={onContextMenu}
                dropIndicator={null} // Pass null, using local state in items
                canSend={canSend}
            />

            {/* Visual Insertion Line at Bottom (For Root Drop) */}
            {/* We position it after the list to indicate "Insert at End / Root" */}
            {showLine && (
                <div className="mx-1 mt-0.5 h-[2px] bg-[#007acc] shadow-[0_0_4px_#007acc] rounded-full" />
            )}

            {/* Empty State Message */}
            {items.length === 0 && !showLine && (
                <div className="p-4 text-center text-[13px] text-[#969696] opacity-60">
                    No commands.<br />Use the menu to add groups or commands.
                </div>
            )}
        </div>
    );
};

const CommandListSidebarContent = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    const { commands, addGroup, addCommand, clearAll, importCommands, exportCommands, setAllCommands, deleteEntity, updateEntity } = useCommandManager();
    const { activeSessionId, sessions, writeToSession, publishMqtt } = useSession();
    const [showMenu, setShowMenu] = useState(false);
    const [editingItem, setEditingItem] = useState<CommandEntity | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: CommandEntity } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const rootItems = useMemo(() => commands.filter(c => !c.parentId), [commands]);

    // Custom collision strategy to support "File Explorer" feel:
    // - Middle 60% of Group -> Drop Into (Returns '-drop' ID)
    // - Edges (Top/Bottom 20%) -> Sort Next (Returns Sortable ID via closestCenter)
    const customCollisionStrategy: CollisionDetection = (args) => {
        // 1. Check direct pointer intersection first
        const pointerCollisions = pointerWithin(args);

        // 1. Priority: Insertion Lines (Top/Bottom) - Explicit ordering
        const insertionLine = pointerCollisions.find(c =>
            c.id.toString().endsWith('-top') ||
            c.id.toString().endsWith('-bottom')
        );

        if (insertionLine) {
            return [insertionLine];
        }

        // 2. Priority: Group Drop Zones (Drop Into)
        const dropZone = pointerCollisions.find(c =>
            c.id.toString().endsWith('-drop')
        );

        if (dropZone) {
            return [dropZone];
        }

        // 3. Fallback: Check if we are over Root Drop
        const rootDrop = pointerCollisions.find(c => c.id === 'root-drop');
        if (rootDrop) {
            return [rootDrop];
        }

        // 4. Fallback to standard sorting collision (closest center) for edges
        return closestCenter(args);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return; // Note: active.id === over.id check is less relevant with alias IDs

        // Handle Root Drop explicitly
        if (over.id === 'root-drop') {
            const activeId = active.id.toString();
            const activeItem = commands.find(c => c.id === activeId);

            // If item is already at root, we might want to move it to the END
            // Or if it was in a group, move to root.
            if (activeItem) {
                if (activeItem.parentId) {
                    // Moving out of group -> Root
                    updateEntity(activeItem.id, { parentId: undefined });
                } else {
                    // Already at root.
                    // If we dragged it to the bottom space, logic implies moving to end.
                    // But arrayMove needs indices.
                    // If we are at root drop, we usually mean "append".
                    const oldIndex = commands.findIndex(c => c.id === activeId);
                    const newIndex = commands.length - 1;
                    if (oldIndex !== newIndex) {
                        // BUT commands includes children!
                        // We need to move it to the end of the COMMANDS array? 
                        // Or end of Root List?
                        // setAllCommands expects full list.
                        // Moving to end of full list is safe way to say "bottom".
                        setAllCommands(arrayMove(commands, oldIndex, newIndex));
                    }
                }
            }
            return;
        }

        // Resolve real IDs (handle -drop alias)
        const activeId = active.id.toString();
        const overIdFull = over.id.toString();

        const isDropInto = overIdFull.endsWith('-drop');
        const isInsertTop = overIdFull.endsWith('-top');
        const isInsertBottom = overIdFull.endsWith('-bottom');

        const overIdClean = overIdFull.replace(/-drop|-top|-bottom/, '');

        if (activeId === overIdClean) return;

        const activeItem = commands.find(c => c.id === activeId);
        const overItem = commands.find(c => c.id === overIdClean);

        if (!activeItem || !overItem) return;

        // 1. Drop ON Group (via -drop zone) -> Reparent
        // Or strict strict check if overItem is group and we are treating it as parent
        if (isDropInto && overItem.type === 'group' && activeItem.parentId !== overItem.id && activeItem.id !== overItem.id) {
            updateEntity(activeItem.id, { parentId: overItem.id });
            return;
        }

        // 2. Cross-level Drop / Standard Sort
        // If normal sort (not drop zone), we treat overItem as sibling
        if (activeItem.parentId !== overItem.parentId) {
            let newCommands = [...commands];
            const activeIndex = newCommands.findIndex(c => c.id === activeId);

            // Remove active item
            const [movedItem] = newCommands.splice(activeIndex, 1);

            // Set parentId to matched target
            movedItem.parentId = overItem.parentId;

            // Find new index
            // We need to find index relative to the FULL list
            const overIndex = newCommands.findIndex(c => c.id === overIdClean);

            let insertIndex = overIndex;
            if (isInsertBottom) {
                insertIndex = overIndex + 1;
            }

            newCommands.splice(insertIndex, 0, movedItem);
            setAllCommands(newCommands);
            return;
        }

        // 3. Sorting (Same level)
        const activeIndex = commands.findIndex(c => c.id === activeId);
        const overIndex = commands.findIndex(c => c.id === overIdClean);

        // Use manual splice to handle precise top/bottom insertion
        let newCommands = [...commands];
        const [movedItem] = newCommands.splice(activeIndex, 1);
        const newOverIndex = newCommands.findIndex(c => c.id === overIdClean);

        let insertIndex = newOverIndex;
        if (isInsertBottom) insertIndex++;

        if (!isInsertTop && !isInsertBottom) {
            // Fallback
            setAllCommands(arrayMove(commands, activeIndex, overIndex));
            return;
        }

        newCommands.splice(insertIndex, 0, movedItem);
        setAllCommands(newCommands);
    };

    const handleSend = async (cmd: CommandItem) => {
        console.log('handleSend called for:', cmd.name, cmd.payload);
        if (!activeSessionId) {
            console.warn('Send failed: No active session selected');
            return;
        }
        const session = sessions.find(s => s.id === activeSessionId);
        if (!session || !session.isConnected) {
            console.warn('Send failed: Session not connected', { session });
            if (onNavigate) {
                onNavigate('serial'); // Redirect to config
            }
            return;
        }

        let data: Uint8Array | string = cmd.payload;

        try {
            if (cmd.html && cmd.tokens && Object.keys(cmd.tokens).length > 0) {
                const div = document.createElement('div');
                div.innerHTML = cmd.html;
                const segments = parseDOM(div);
                data = compileSegments(segments, cmd.mode, cmd.tokens);
            } else if (cmd.mode === 'hex') {
                data = parseHex(cmd.payload);
            }

            if (session.config.type === 'mqtt') {
                // MQTT
                await publishMqtt(session.id, 'command', data, { qos: 0, retain: false });
            } else {
                // Serial
                await writeToSession(session.id, data);
            }
        } catch (e) {
            console.error('Failed to send command', e);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, item: CommandEntity) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item
        });
    };

    const getMenuItems = () => {
        if (!contextMenu) return [];
        const { item } = contextMenu;
        const items = [
            {
                label: 'Edit',
                onClick: () => setEditingItem(item)
            },
            {
                label: 'Delete',
                icon: <Trash2 size={13} />,
                color: 'red',
                onClick: () => deleteEntity(item.id)
            }
        ];

        if (item.type === 'group') {
            items.unshift({
                label: 'New Command',
                icon: <FileText size={13} />,
                onClick: () => addCommand({ name: 'New Command', payload: '', mode: 'text', tokens: {}, parentId: item.id })
            });
            // Can add New Group in Group if we want nested groups
            items.unshift({
                label: 'New Group',
                icon: <FolderPlus size={13} />,
                onClick: () => addGroup('New Group', item.id)
            });
        }

        return items;
    };

    return (
        <div className="flex flex-col h-full bg-[#252526] text-[#cccccc]" onContextMenu={(e) => { e.preventDefault(); }}>
            {/* Header / Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold bg-[#252526] border-b border-[#3c3c3c]">
                <span className="uppercase tracking-wide">Command Menu</span>
                <div className="flex items-center gap-1 relative">
                    <button
                        className="p-1 hover:bg-[#3c3c3c] rounded text-[#cccccc]"
                        title="Menu"
                        onClick={() => setShowMenu(!showMenu)}
                    >
                        <MoreHorizontal size={14} />
                    </button>

                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-[#252526] border border-[#3c3c3c] shadow-lg rounded-sm z-50 text-[13px]">
                                <div className="py-1">
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { addGroup('New Group'); setShowMenu(false); }}>
                                        <FolderPlus size={14} /> New Group
                                    </div>
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { addCommand({ name: 'New Command', payload: '', mode: 'text', tokens: {} }); setShowMenu(false); }}>
                                        <FileText size={14} /> New Command
                                    </div>
                                    <div className="h-[1px] bg-[#3c3c3c] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { importCommands(); setShowMenu(false); }}>
                                        <Upload size={14} /> Import...
                                    </div>
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2"
                                        onClick={() => { exportCommands(); setShowMenu(false); }}>
                                        <Upload size={14} className="rotate-180" /> Export
                                    </div>
                                    <div className="h-[1px] bg-[#3c3c3c] my-1" />
                                    <div className="px-3 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer flex items-center gap-2 text-red-400"
                                        onClick={() => { clearAll(); setShowMenu(false); }}>
                                        <Trash2 size={14} /> Clear All
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* List Content */}
            {/* We enable DndContext at this level so CommandScrollArea can define a valid Droppable */}
            <div className="flex-1 flex flex-col min-h-0">
                <DndContext
                    sensors={sensors}
                    collisionDetection={customCollisionStrategy}
                    onDragEnd={handleDragEnd}
                >
                    <CommandScrollArea
                        items={rootItems}
                        onEdit={setEditingItem}
                        onSend={(cmd) => handleSend(cmd as CommandItem)}
                        onContextMenu={handleContextMenu}
                        canSend={!!activeSessionId}
                    />
                </DndContext>
            </div>

            {editingItem && (
                <CommandEditorDialog
                    item={editingItem}
                    onClose={() => setEditingItem(null)}
                    onSave={(updates) => {
                        updateEntity(editingItem.id, updates);
                        setEditingItem(null);
                    }}
                />
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={getMenuItems()}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );
};

export const CommandListSidebar = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    return (
        <CommandProvider>
            <CommandListSidebarContent onNavigate={onNavigate} />
        </CommandProvider>
    );
};
