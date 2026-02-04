import React from 'react';
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { GripVertical } from 'lucide-react';

// Define event for interaction
export const SERIAL_TOKEN_CLICK_EVENT = 'serial-token-click';

export const SerialTokenComponent: React.FC<NodeViewProps> = ({ node, getPos, selected }) => {
    const { id, type, config } = node.attrs;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement; // Use currentTarget to ensure we get the label/box, not inner content
        const rect = target.getBoundingClientRect();

        console.log('SerialToken Clicked (Component):', { id, type, config });

        // Dispatch custom event that SerialInput listens to
        // If it's Hex, we want to click the label.
        const event = new CustomEvent(SERIAL_TOKEN_CLICK_EVENT, {
            detail: { id, type, config, x: rect.left, y: rect.bottom, pos: getPos() }
        });
        window.dispatchEvent(event);
    };

    if (type === 'hex') {
        const byteWidth = config.byteWidth || 1;
        // CRITICAL: NodeViewContent must not be nested inside contentEditable={false} elements
        // Solution: Use a simple structure where NodeViewContent is the primary child
        return (
            <NodeViewWrapper
                as="span"
                className="inline-flex items-center align-middle mx-0.5"
                style={{
                    border: '1px solid #4c4c4c',
                    borderRadius: '3px',
                    backgroundColor: '#2d2d2d',
                    boxShadow: selected ? '0 0 0 1px var(--vscode-focusBorder)' : 'none'
                }}
            >
                {/* Label - Before content, using ::before pseudo or separate span */}
                <span
                    contentEditable={false}
                    suppressContentEditableWarning
                    onClick={handleClick}
                    className="shrink-0 bg-[#3c3c3c] text-[#9cdcfe] text-[10px] font-mono px-1 py-0.5 cursor-pointer hover:bg-[#505050] border-r border-[#4c4c4c] select-none"
                    style={{ userSelect: 'none', pointerEvents: 'auto' }}
                    title="Click to configure Byte Width"
                >
                    {byteWidth}B
                </span>

                {/* Content Area - MUST be direct child with no contentEditable={false} wrapper */}
                <NodeViewContent
                    as="span"
                    className="px-1 min-w-[40px] font-mono text-[13px] outline-none"
                    style={{
                        color: 'var(--st-input-text, #d4d4d4)',
                        minHeight: '1.2em',
                        display: 'inline-block'
                    }}
                />
            </NodeViewWrapper>
        );
    }

    let label = 'Unknown';
    if (type === 'crc') {
        label = 'CRC';
        switch (config.algorithm) {
            case 'modbus-crc16': label = 'CRC: Modbus'; break;
            case 'ccitt-crc16': label = 'CRC: CCITT'; break;
            case 'crc32': label = 'CRC: 32'; break;
        }
    } else if (type === 'flag') {
        const hex = config.hex || '';
        const display = hex.length > 20 ? hex.substring(0, 20) + '...' : hex;
        label = config.name ? `${config.name}: ${display}` : (hex ? `Flag: ${display}` : 'Flag');
    }

    const colorClass = type === 'crc'
        ? 'text-[var(--st-token-crc)] border-l-[var(--st-token-crc)] hover:border-l-[var(--st-token-crc)] ring-[var(--st-token-crc)]'
        : 'text-[var(--st-token-flag)] border-l-[var(--st-token-flag)] hover:border-l-[var(--st-token-flag)] ring-[var(--st-token-flag)]';

    return (
        <NodeViewWrapper as="span" className="inline-block align-middle select-all mr-1">
            <span
                data-drag-handle
                onClick={handleClick}
                className={`
                    inline-flex items-center px-1.5 h-[22px] 
                    bg-[#252526] ${colorClass}
                    text-[13px] font-mono leading-none 
                    border border-[#3c3c3c] border-l-[3px] hover:border-[#505050]
                    cursor-pointer whitespace-nowrap overflow-hidden
                    transition-all rounded-[3px]
                    ${selected ? 'ring-1 border-transparent' : ''}
                    shadow-sm
                `}
                title="Click to configure, Drag to move"
            >
                {label}
            </span>
        </NodeViewWrapper>
    );
};
