import React from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';

// Define event for interaction
export const SERIAL_TOKEN_CLICK_EVENT = 'serial-token-click';

export const SerialTokenComponent: React.FC<NodeViewProps> = ({ node, getPos, selected }) => {
    const { id, type, config } = node.attrs;

    const handleClick = (e: React.MouseEvent) => {
        // e.preventDefault();
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();

        // Dispatch custom event that SerialInput listens to
        const event = new CustomEvent(SERIAL_TOKEN_CLICK_EVENT, {
            detail: { id, type, config, x: rect.left, y: rect.bottom, pos: getPos() }
        });
        window.dispatchEvent(event);
    };

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

    return (
        <NodeViewWrapper as="span" className="inline-block align-middle select-all mr-1">
            <span
                data-drag-handle
                onClick={handleClick}
                className={`
                    inline-flex items-center px-1.5 h-[22px] 
                    bg-[#252526] text-[#4ec9b0] 
                    text-[13px] font-mono leading-none 
                    border border-[#3c3c3c] border-l-[3px] hover:border-[#505050] hover:border-l-[#4ec9b0]
                    cursor-pointer whitespace-nowrap overflow-hidden
                    transition-all rounded-[3px]
                    ${selected ? 'ring-1 ring-[#4ec9b0] border-[#4ec9b0]' : ''}
                    shadow-sm
                `}
                title="Click to configure, Drag to move"
            >
                {label}
            </span>
        </NodeViewWrapper>
    );
};
