import { GraphNode, GraphEdge } from '../VirtualPortService';

interface GraphCanvasProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    tempEdge?: { sourceX: number, sourceY: number, targetX: number, targetY: number } | null;
}

export const GraphCanvas = ({ nodes, edges, tempEdge }: GraphCanvasProps) => {
    // Helper to get node handle positions
    // In GraphNode, width is min-140px. Height variable but let's approximate center-side.
    // Handles are at -Left and -Right.
    // We assume width ~140, height ~80?
    // Accurate calculation requires refs but for now we adjust offsets.
    // Node left/top is at x,y.
    // Input handle: x - 6, y + height/2
    // Output handle: x + width + 6, y + height/2

    // Simplification: We assume a fixed approximate size for handles.
    const NODE_WIDTH = 140;
    const NODE_HEIGHT = 80; // approximate

    const getHandlePos = (nodeId: string, type: 'source' | 'target') => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };

        const cy = node.position.y + (NODE_HEIGHT / 2); // vertically centered roughly
        // Ideally we measure the DOM but let's hardcode for the prototype.
        // Actually, the node height is determined by content. Let's guess ~40px offset.

        if (type === 'source') {
            return { x: node.position.x + NODE_WIDTH, y: cy };
        } else {
            return { x: node.position.x, y: cy };
        }
    };

    const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x2 - x1);
        const cp1x = x1 + dist * 0.5;
        const cp2x = x2 - dist * 0.5;
        // Ensure control points pull out horizontally
        // Use a min distance for CP to avoid tight loops when close?
        // Standard flowchart logic:
        return `M ${x1} ${y1} C ${Math.max(x1 + 50, cp1x)} ${y1}, ${Math.min(x2 - 50, cp2x)} ${y2}, ${x2} ${y2}`;
    };

    return (
        <svg className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-0">
            <defs>
                {/* Gradient for wires? */}
            </defs>
            {edges.map(edge => {
                const src = getHandlePos(edge.sourceStr, 'source');
                const tgt = getHandlePos(edge.targetStr, 'target');
                return (
                    <g key={edge.id}>
                        <path
                            d={getBezierPath(src.x, src.y, tgt.x, tgt.y)}
                            stroke="#555"
                            strokeWidth="4"
                            fill="none"
                            className="transition-colors"
                        />
                        <path
                            d={getBezierPath(src.x, src.y, tgt.x, tgt.y)}
                            stroke={edge.active ? "var(--vscode-textLink-foreground)" : "#666"}
                            strokeWidth="2"
                            fill="none"
                            pointerEvents="visibleStroke" // Could allow clicking wire to delete
                        />
                    </g>
                );
            })}
            {tempEdge && (
                <path
                    d={getBezierPath(tempEdge.sourceX, tempEdge.sourceY, tempEdge.targetX, tempEdge.targetY)}
                    stroke="var(--vscode-textLink-foreground)"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    fill="none"
                />
            )}
        </svg>
    );
};
