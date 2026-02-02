import { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CommandEntity, CommandItem } from '../../types/command';
import { SerialInput } from '../serial/SerialInput';

interface Props {
    item: CommandEntity;
    onClose: () => void;
    onSave: (updates: Partial<CommandEntity>) => void;
}

export const CommandEditorDialog = ({ item, onClose, onSave }: Props) => {
    const [name, setName] = useState(item.name);
    // State to hold current input state from SerialInput
    const inputStateRef = useRef<{ content: string; html: string; tokens: any; mode: 'text' | 'hex'; lineEnding: any } | null>(null);

    // Initial state
    const isCommand = item.type === 'command';
    const commandItem = isCommand ? (item as CommandItem) : null;

    const handleSave = () => {
        const updates: Partial<CommandEntity> = { name };
        if (isCommand && inputStateRef.current) {
            (updates as Partial<CommandItem>).payload = inputStateRef.current.content;
            (updates as Partial<CommandItem>).html = inputStateRef.current.html;
            (updates as Partial<CommandItem>).tokens = inputStateRef.current.tokens;
            (updates as Partial<CommandItem>).mode = inputStateRef.current.mode;
            (updates as Partial<CommandItem>).lineEnding = inputStateRef.current.lineEnding;
        }
        onSave(updates);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[#252526] border border-[#3c3c3c] shadow-xl w-[600px] flex flex-col rounded-sm">
                <div className="flex items-center justify-between p-2 border-b border-[#3c3c3c]">
                    <span className="text-xs font-bold text-[#cccccc] uppercase">Edit {isCommand ? 'Command' : 'Group'}</span>
                    <button onClick={onClose} className="text-[#969696] hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-[#969696]">Name</label>
                        <input
                            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] rounded-sm px-2 py-1 outline-none focus:border-[var(--vscode-focusBorder)] text-xs"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {isCommand && commandItem && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-[#969696]">Content</label>
                            <SerialInput
                                onSend={() => { }} // We don't send from editor
                                initialContent={commandItem.payload}
                                initialHTML={commandItem.html}
                                initialTokens={commandItem.tokens}
                                initialMode={commandItem.mode}
                                initialLineEnding={commandItem.lineEnding}
                                onStateChange={(state) => {
                                    inputStateRef.current = state;
                                }}
                            // Hide features not needed for editor if possible (timer?)
                            // SerialInput doesn't have props to hide them individually yet, but it's fine.
                            />
                        </div>
                    )}
                </div>

                <div className="p-2 border-t border-[#3c3c3c] flex justify-end gap-2">
                    <button
                        className="px-3 py-1 text-xs text-[#cccccc] hover:bg-[#3c3c3c] rounded-sm"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="px-3 py-1 text-xs text-white bg-[#007acc] hover:bg-[#0098ff] rounded-sm"
                        onClick={handleSave}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
