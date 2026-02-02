import { MoreHorizontal } from 'lucide-react';
import { ConfigSidebar } from '../serial/ConfigSidebar';
import { SessionListSidebar } from '../serial/SessionListSidebar';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { CommandListSidebar } from '../commands/CommandListSidebar';

interface SideBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SideBar = ({ activeView, onViewChange, sessionManager, editorLayout }: SideBarProps) => {
    return (
        <div className="w-[250px] bg-[var(--vscode-sidebar)] flex flex-col border-r border-[var(--vscode-border)]">
            <div className="h-[35px] px-4 flex items-center justify-between text-[11px] font-bold text-[var(--vscode-fg)] tracking-wide uppercase">
                <span>{activeView === 'explorer' ? 'SESSIONS' : activeView === 'serial' ? 'CONFIGURATION' : activeView === 'commands' ? 'COMMANDS' : activeView}</span>
                <MoreHorizontal size={14} className="cursor-pointer hover:text-white" />
            </div>

            {activeView === 'explorer' && <SessionListSidebar sessionManager={sessionManager} editorLayout={editorLayout} />}
            {activeView === 'search' && <div className="p-4 text-xs text-[#969696]">Search not implemented</div>}
            {activeView === 'serial' && <ConfigSidebar sessionManager={sessionManager} />}
            {activeView === 'commands' && <CommandListSidebar onNavigate={onViewChange} />}
        </div>
    );
};
