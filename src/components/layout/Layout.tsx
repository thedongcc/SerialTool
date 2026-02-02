import { useState, type ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { SideBar } from './SideBar';
import { StatusBar } from './StatusBar';
import { EditorArea } from './EditorArea';
import { Panel } from './Panel';
import { useEditorLayout } from '../../hooks/useEditorLayout';
import { useSessionManager } from '../../hooks/useSessionManager';
import { SessionProvider } from '../../context/SessionContext';

import { PluginProvider } from '../../context/PluginContext';

export const Layout = ({ children }: { children?: ReactNode }) => {
    const [activeView, setActiveView] = useState('explorer');
    const sessionManager = useSessionManager();
    const editorLayout = useEditorLayout();

    const handleOpenSettings = async () => {
        // Check if settings session exists
        let settingsSession = sessionManager.sessions.find(s => s.config.type === 'settings');
        if (!settingsSession) {
            // Create new settings session
            // We use a simpler approach since createSession might enforce type
            // Assuming createSession handles Generic config
            const newId = await sessionManager.createSession();
            // We need to UPDATE the config to be settings type because createSession makes a serial session by default?
            // createSession implementation in useSessionManager needs to support passing config?
            // Let's check useSessionManager. 
            // If createSession is hardcoded to 'serial', we might need to update it.
            // But we can update config immediately.
            if (newId) {
                sessionManager.updateSessionConfig(newId, { type: 'settings', name: 'Settings' } as any);
                editorLayout.openSession(newId);
                sessionManager.setActiveSessionId(newId);
            }
        } else {
            editorLayout.openSession(settingsSession.id);
            sessionManager.setActiveSessionId(settingsSession.id);
        }
    };

    return (
        <SessionProvider manager={sessionManager}>
            <PluginProvider>
                <div className="flex flex-col h-screen w-full bg-[var(--vscode-bg)] text-[var(--vscode-fg)] overflow-hidden">
                    <TitleBar />
                    <div className="flex-1 flex overflow-hidden">
                        <ActivityBar activeView={activeView} onViewChange={setActiveView} onOpenSettings={handleOpenSettings} />
                        <SideBar activeView={activeView} onViewChange={setActiveView} sessionManager={sessionManager} editorLayout={editorLayout} />

                        <div className="flex-1 flex flex-col min-w-0">
                            <EditorArea sessionManager={sessionManager} editorLayout={editorLayout} onShowSettings={setActiveView}>{children}</EditorArea>
                        </div>

                        <div className="w-[300px] border-l border-[var(--vscode-border)] bg-[var(--vscode-sidebar)] hidden">
                            {/* <LogViewerForActiveSession /> */}
                        </div>
                    </div>
                    <StatusBar />
                </div>
            </PluginProvider>
        </SessionProvider>
    );
};
