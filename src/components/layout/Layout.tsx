import { useState, type ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { SideBar } from './SideBar';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { Panel } from './Panel';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { useSessionManager } from '../../hooks/useSessionManager';

export const Layout = ({ children }: { children?: ReactNode }) => {
    const [activeView, setActiveView] = useState('explorer');
    const sessionManager = useSessionManager();
    const editorLayout = useEditorLayout();

    return (
        <div className="flex flex-col h-screen w-full bg-[var(--vscode-bg)] text-[var(--vscode-fg)] overflow-hidden">
            <TitleBar />

            <div className="flex-1 flex overflow-hidden">
                <ActivityBar activeView={activeView} onViewChange={setActiveView} />
                <SideBar activeView={activeView} sessionManager={sessionManager} editorLayout={editorLayout} />

                <div className="flex-1 flex flex-col min-w-0">
                    <EditorArea sessionManager={sessionManager} editorLayout={editorLayout} onShowSettings={setActiveView}>{children}</EditorArea>

                    <Panel sessionManager={sessionManager} />
                </div>
            </div>

            <StatusBar />
        </div>
    );
};
