import { useEffect, useRef, useState } from 'react';
import { Token, CRCConfig } from '../../types/token';
import { X, Check } from 'lucide-react';

interface TokenConfigPopoverProps {
    token: Token;
    onUpdate: (id: string, newConfig: any) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

export const TokenConfigPopover = ({ token, onUpdate, onDelete, onClose, position }: TokenConfigPopoverProps) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [config, setConfig] = useState<CRCConfig>(token.config as CRCConfig);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (token.type !== 'crc') return null;

    const handleSave = () => {
        onUpdate(token.id, config);
        onClose();
    };

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 w-64 bg-[#252526] border border-[var(--vscode-widget-border)] shadow-xl rounded-md flex flex-col text-[var(--vscode-fg)]"
            style={{
                left: Math.min(position.x, window.innerWidth - 270), // Keep within screen
                top: position.y + 24
            }}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-border)] bg-[#2d2d2d]">
                <span className="text-xs font-bold uppercase tracking-wide">CRC Configuration</span>
                <div className="flex gap-2">
                    <X size={14} className="cursor-pointer hover:text-white" onClick={onClose} />
                </div>
            </div>

            <div className="p-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#969696]">Algorithm</label>
                    <select
                        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                        value={config.algorithm}
                        onChange={e => setConfig({ ...config, algorithm: e.target.value as any })}
                    >
                        <option value="modbus-crc16">Modbus CRC16 (LE)</option>
                        <option value="ccitt-crc16">CCITT CRC16 (BE)</option>
                        <option value="crc32">CRC32</option>
                    </select>
                </div>

                <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Start Offset</label>
                        <input
                            type="number"
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                            value={config.startIndex}
                            onChange={e => setConfig({ ...config, startIndex: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[11px] text-[#969696]">Length</label>
                        <input
                            type="number"
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[12px] p-1 outline-none rounded-sm focus:border-[var(--vscode-focusBorder)]"
                            value={config.length}
                            onChange={e => setConfig({ ...config, length: parseInt(e.target.value) || 0 })}
                            placeholder="0 = All"
                            title="Bytes to check. 0 means 'until this token'"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between mt-1">
                    <button
                        className="px-2 py-1 text-[11px] text-[#f48771] hover:bg-[#4b1818] rounded"
                        onClick={() => { onDelete(token.id); onClose(); }}
                    >
                        Remove Token
                    </button>
                    <button
                        className="px-3 py-1 bg-[var(--vscode-button-bg)] text-white text-[12px] rounded hover:bg-[var(--vscode-button-hover-bg)] flex items-center gap-1"
                        onClick={handleSave}
                    >
                        <Check size={12} /> Apply
                    </button>
                </div>
            </div>
        </div>
    );
};
