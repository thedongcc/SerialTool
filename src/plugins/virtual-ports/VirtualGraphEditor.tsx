import { useState, useRef, useEffect } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { virtualPortService, GraphNode as IGraphNode, GraphEdge as IGraphEdge } from './VirtualPortService';
import { GraphNode } from './graph/GraphNode';
import { GraphCanvas } from './graph/GraphCanvas';
import { Plus, Trash2, Layout, ZoomIn, ZoomOut } from 'lucide-react';

interface VirtualGraphEditorProps {
    sessionId?: string;
}

export const VirtualGraphEditor = ({ sessionId }: VirtualGraphEditorProps) => {
    // Local state for UI responsiveness, synced with Service
    const [nodes, setNodes] = useState<IGraphNode[]>([]);
    const [edges, setEdges] = useState<IGraphEdge[]>([]);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const tempEdgeRef = useRef<{ sourceNode: string, type: 'source' | 'target' } | null>(null);

    // Temp edge for visual rendering
    // Temp edge for visual rendering
    const [tempEdge, setTempEdge] = useState<{ sourceX: number, sourceY: number, targetX: number, targetY: number } | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // Initial Load & Sync using 'global' virtual port service for now
    // In future, if sessionId implies separate graph, we'd load that specific graph.
    useEffect(() => {
        const update = () => {
            const g = virtualPortService.getGraph();
            setNodes(g.nodes);
            setEdges(g.edges);
        };
        update();
        const unsub = virtualPortService.onStateChange(update);
        return () => unsub();
    }, [sessionId]);

    // Handle Delete Key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeId) {
                    const newNodes = nodes.filter(n => n.id !== selectedNodeId);
                    const newEdges = edges.filter(e => e.sourceStr !== selectedNodeId && e.targetStr !== selectedNodeId);
                    setNodes(newNodes);
                    setEdges(newEdges);
                    virtualPortService.updateGraph(newNodes, newEdges);
                    setSelectedNodeId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, nodes, edges]);

    const handleDragEnd = (event: DragEndEvent) => {
        // ...
        // ... inside return ...
        {
            nodes.map(node => (
                <GraphNode
                    key={node.id}
                    {...node}
                    x={node.position.x}
                    y={node.position.y}
                    isSelected={selectedNodeId === node.id}
                    onSelect={(id) => setSelectedNodeId(id)}
                    onHandleMouseDown={handleHandleMouseDown}
                />
            ))
        }
        const { id } = event.active;
        const { delta } = event;

        const newNodes = nodes.map(n => {
            if (n.id === id) {
                return {
                    ...n,
                    position: {
                        x: n.position.x + delta.x / scale, // Adjust for zoom
                        y: n.position.y + delta.y / scale
                    }
                };
            }
            return n;
        });

        setNodes(newNodes);
        virtualPortService.updateGraph(newNodes, edges);
    };

    // --- Wire Connection Logic ---

    // Helper to get handle position (Duplicated from Canvas for now)
    const getHandlePos = (nodeId: string, type: 'source' | 'target') => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };
        const NODE_WIDTH = 140;
        // const NODE_HEIGHT = 80;
        const cy = node.position.y + 40; // Approximate center
        if (type === 'source') return { x: node.position.x + NODE_WIDTH + 6, y: cy };
        return { x: node.position.x - 6, y: cy };
    };

    const handleHandleMouseDown = (nodeId: string, type: 'source' | 'target') => {
        tempEdgeRef.current = { sourceNode: nodeId, type };

        const startPos = getHandlePos(nodeId, type);
        // Initialize temp edge
        setTempEdge({
            sourceX: startPos.x,
            sourceY: startPos.y,
            targetX: startPos.x,
            targetY: startPos.y
        });

        // Add specific mouse move/up listeners for the wire drag
        window.addEventListener('mousemove', handleWireMouseMove);
        window.addEventListener('mouseup', handleWireMouseUp);
    };

    const handleWireMouseMove = (e: MouseEvent) => {
        if (!tempEdgeRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / scale;
        const y = (e.clientY - rect.top - pan.y) / scale;

        setTempEdge(prev => {
            if (!prev) return null;
            return { ...prev, targetX: x, targetY: y };
        });
    };

    const handleWireMouseUp = (e: MouseEvent) => {
        // Check if we dropped on a handle?
        // We can check if e.target has data-handle-id attribute or we rely on standard collision?
        // Or simpler: The Handle div stops propagation? No, wire drag is on window.
        // We need to hit-test.

        // Let's rely on the DOM element under cursor
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        // Traverse up to find handle
        let handleEl = targetEl;
        while (handleEl && !handleEl.hasAttribute('data-handle-id')) {
            handleEl = handleEl.parentElement;
            if (handleEl === document.body) { handleEl = null; break; }
        }

        if (handleEl && tempEdgeRef.current) {
            const targetId = handleEl.getAttribute('data-handle-id');
            const targetType = handleEl.getAttribute('data-handle-type'); // Need to add this to GraphNode

            if (targetId && targetType && targetId !== tempEdgeRef.current.sourceNode) {
                // Determine Source vs Target based on Types
                // A connection must be Source(Output) -> Target(Input).
                // Or we allow arbitrary? Let's enforce direction.
                // Our GraphNode handles: 'source' (Right, Output), 'target' (Left, Input).

                let sourceNodeId = tempEdgeRef.current.sourceNode;
                let targetNodeId = targetId;

                // If we dragged from Input -> needs to land on Output? Or Input to Output?
                // Standard: Drag from Output -> Drop on Input. Or Drag from Input -> Drop on Output.
                // If types match (Output->Output), reject?

                let isValid = false;
                if (tempEdgeRef.current.type === 'source' && targetType === 'target') {
                    isValid = true;
                } else if (tempEdgeRef.current.type === 'target' && targetType === 'source') {
                    // Swapped
                    sourceNodeId = targetId;
                    targetNodeId = tempEdgeRef.current.sourceNode;
                    isValid = true;
                }

                if (isValid) {
                    // Check duplicates
                    if (!edges.some(edge => edge.sourceStr === sourceNodeId && edge.targetStr === targetNodeId)) {
                        const newEdge: IGraphEdge = {
                            id: `edge-${Date.now()}`,
                            sourceStr: sourceNodeId,
                            targetStr: targetNodeId,
                            active: true
                        };
                        const newEdges = [...edges, newEdge];
                        setEdges(newEdges);
                        virtualPortService.updateGraph(nodes, newEdges);
                    }
                }
            }
        }

        // Cleanup
        window.removeEventListener('mousemove', handleWireMouseMove);
        window.removeEventListener('mouseup', handleWireMouseUp);
        setTempEdge(null);
        tempEdgeRef.current = null;
    };


    // --- Pan / Zoom / Drag Logic ---
    const [isPanning, setIsPanning] = useState(false);
    const lastPanObj = useRef({ x: 0, y: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        // Right click or Middle click
        if (e.button === 2 || e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            lastPanObj.current = { x: e.clientX, y: e.clientY };
            // Capture pointer
            (e.target as Element).setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning) {
            e.preventDefault();
            const dx = e.clientX - lastPanObj.current.x;
            const dy = e.clientY - lastPanObj.current.y;
            lastPanObj.current = { x: e.clientX, y: e.clientY };
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isPanning) {
            setIsPanning(false);
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-[#1e1e1e] overflow-hidden"
            onContextMenu={e => e.preventDefault()} // Block context menu
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={(e) => {
                if (e.ctrlKey) {
                    // Zoom
                    e.preventDefault();
                    // Calc zoom around pointer? For now center or simple:
                    const zoomDelta = e.deltaY * -0.001;
                    const newScale = Math.min(Math.max(0.1, scale + zoomDelta), 5);
                    // To zoom towards mouse, we need complex math adjusting Pan.
                    // Simple scale for now.
                    setScale(newScale);
                } else {
                    // Pan with wheel (if trackpad)
                    // setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
                }
            }}
        >
            {/* Grid Background */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)',
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                }}
            />

            {/* Toolbar */}
            <div className="absolute top-4 left-4 z-50 flex gap-2">
                <div className="flex bg-[#252526] rounded-md border border-[#3c3c3c] overflow-hidden shadow-lg">
                    <button onClick={() => addNode('virtual')} className="p-2 hover:bg-[#3c3c3c] text-[#4ec9b0]" title="Add Virtual Node">
                        <Plus size={16} />
                    </button>
                    <button onClick={() => addNode('physical')} className="p-2 hover:bg-[#3c3c3c] text-[#ce9178]" title="Add Physical Node">
                        <Plus size={16} />
                    </button>
                    <div className="w-[1px] bg-[#3c3c3c]"></div>
                    <button onClick={clearGraph} className="p-2 hover:bg-red-900/50 text-red-400" title="Clear Graph">
                        <Trash2 size={16} />
                    </button>
                </div>

                <div className="flex bg-[#252526] rounded-md border border-[#3c3c3c] overflow-hidden shadow-lg ml-4">
                    <button onClick={() => setScale(s => s + 0.1)} className="p-2 hover:bg-[#3c3c3c] text-gray-400"><ZoomIn size={16} /></button>
                    <span className="p-2 px-3 text-xs text-gray-500 font-mono flex items-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-[#3c3c3c] text-gray-400"><ZoomOut size={16} /></button>
                    <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-[#3c3c3c] text-gray-400"><Layout size={16} /></button>
                </div>
            </div>

            {/* Graph Content */}
            <div
                className="absolute inset-0 origin-top-left touch-none"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
                <DndContext
                    sensors={sensors}
                    onDragStart={() => {
                        // Prevent conflict if needed? DndKit handles it usually if sensors configured right.
                    }}
                    onDragEnd={handleDragEnd}
                >
                    <GraphCanvas nodes={nodes} edges={edges} tempEdge={tempEdge} />

                    {nodes.map(node => (
                        <GraphNode
                            key={node.id}
                            {...node}
                            x={node.position.x}
                            y={node.position.y}
                            isSelected={selectedNodeId === node.id}
                            onSelect={(id) => setSelectedNodeId(id)}
                            onHandleMouseDown={handleHandleMouseDown}
                        />
                    ))}
                </DndContext>
            </div>
        </div>
    );
};
