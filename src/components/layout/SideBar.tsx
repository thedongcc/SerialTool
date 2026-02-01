import { ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import { ConfigSidebar } from '../serial/ConfigSidebar';
import { SessionListSidebar } from '../serial/SessionListSidebar';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useEditorLayout } from '../../hooks/useEditorLayout';

// ... (keep FileTreeItem and ExplorerView but we are not using ExplorerView anymore for now, or maybe detailed later)
// Actually I can remove ExplorerView if it's not used, or keep it. The user wants "explorer view shows session list".

interface SideBarProps {
    activeView: string;
    sessionManager: ReturnType<typeof useSessionManager>;
    editorLayout: ReturnType<typeof useEditorLayout>;
}

export const SideBar = ({ activeView, sessionManager, editorLayout }: SideBarProps) => {
    return (
        <div className="w-[250px] bg-[var(--vscode-sidebar)] flex flex-col border-r border-[var(--vscode-border)]">
            <div className="h-[35px] px-4 flex items-center justify-between text-[11px] font-bold text-[var(--vscode-fg)] tracking-wide uppercase">
                <span>{activeView === 'explorer' ? 'SESSIONS' : activeView === 'serial' ? 'CONFIGURATION' : activeView}</span>
                <MoreHorizontal size={14} className="cursor-pointer hover:text-white" />
            </div>

            {activeView === 'explorer' && <SessionListSidebar sessionManager={sessionManager} editorLayout={editorLayout} />}
            {activeView === 'search' && <div className="p-4 text-xs text-[#969696]">Search not implemented</div>}
            {activeView === 'serial' && <ConfigSidebar sessionManager={sessionManager} />}
        </div>
    );
};
