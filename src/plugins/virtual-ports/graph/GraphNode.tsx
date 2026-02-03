import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Network, Monitor } from 'lucide-react';

interface GraphNodeProps {
    id: string;
    type: 'physical' | 'virtual';
    portPath: string;
    x: number;
    y: number;
    isSelected?: boolean;
    onSelect?: (id: string) => void;
    // Handlers for starting connections
    onHandleMouseDown?: (nodeId: string, type: 'source' | 'target') => void;
}

export const GraphNode = ({ id, type, portPath, x, y, isSelected, onSelect, onHandleMouseDown }: GraphNodeProps) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: id,
        data: { type: 'node', id } // Identify as node for DND
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        left: x,
        top: y,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`absolute flex flex-col min-w-[140px] rounded-lg shadow-lg cursor-grab active:cursor-grabbing select-none
                ${isSelected ? 'ring-2 ring-[var(--vscode-focusBorder)]' : ''}
                bg-[#2b2b2b] border border-[#1e1e1e]
            `}
            onClick={(e) => {
                e.stopPropagation();
                onSelect?.(id);
            }}
        >
            {/* Header */}
            <div className={`
                h-6 px-2 flex items-center gap-2 rounded-t-lg text-[11px] font-bold text-white
                ${type === 'virtual' ? 'bg-[#3c3c3c]' : 'bg-[#403c3a]'}
            `}>
                <div className={`w-2 h-2 rounded-full ${type === 'virtual' ? 'bg-[#4ec9b0]' : 'bg-[#ce9178]'}`} />
                <span className="truncate flex-1">{type.toUpperCase()}</span>
            </div>

            {/* Body */}
            <div className="p-3 flex flex-col gap-2 relative">
                {/* Visual Label */}
                <div className="flex items-center gap-2 text-[var(--vscode-fg)]">
                    {type === 'virtual' ? <Network size={16} className="text-[#4ec9b0]" /> : <Monitor size={16} className="text-[#ce9178]" />}
                    <span className="font-mono text-xs font-bold truncate" title={portPath}>{portPath}</span>
                </div>

                {/* Additional Info or Status would go here */}
            </div>

            {/* Input Handle (Left) */}
            <div
                className="absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1e1e1e] border-2 border-[#777] hover:border-[#fff] hover:scale-125 transition-all cursor-crosshair z-20"
                title="Input (RX)"
                onPointerDown={(e) => {
                    e.stopPropagation();
                    // e.preventDefault(); // Prevent text selection etc
                    onHandleMouseDown?.(id, 'target'); // Acts as target for incoming edge
                }}
            />

            {/* Output Handle (Right) */}
            <div
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1e1e1e] border-2 border-[#777] hover:border-[#fff] hover:scale-125 transition-all cursor-crosshair z-20"
                title="Output (TX)"
                onPointerDown={(e) => {
                    e.stopPropagation();
                    // e.preventDefault();
                    onHandleMouseDown?.(id, 'source'); // Acts as source for outgoing edge
                }}
            />
        </div>
    );
};
