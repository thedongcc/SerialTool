import { type ReactNode, useState, useRef, useEffect } from 'react';
import { Files, Search, GitGraph, Box, Settings, User, Monitor, Check, Terminal } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { usePluginManager } from '../../context/PluginContext';

interface ActivityItemProps {
    icon: ReactNode;
    active?: boolean;
    onClick?: () => void;
    className?: string;
}

const ActivityItem = ({ icon, active, onClick, className }: ActivityItemProps) => (
    <div
        className={`w-[48px] h-[48px] flex items-center justify-center cursor-pointer relative hover:text-white transition-colors ${active ? 'text-white border-l-2 border-[var(--vscode-accent)]' : 'text-[var(--vscode-activitybar-inactive-fg)]'} ${className}`}
        onClick={onClick}
    >
        {icon}
    </div>
);

interface ActivityBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
}

export const ActivityBar = ({ activeView, onViewChange }: ActivityBarProps) => {
    const { plugins } = usePluginManager();
    const { theme, setTheme } = useTheme();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeSubmenu, setActiveSubmenu] = useState<'main' | 'themes'>('main');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
                setActiveSubmenu('main');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const resetMenu = () => {
        setIsMenuOpen(false);
        setActiveSubmenu('main');
    };

    return (
        <div className="w-[48px] bg-[var(--vscode-activitybar)] flex flex-col justify-between py-2 border-r border-[var(--vscode-border)] z-40">
            <div className="flex flex-col gap-0">
                <ActivityItem
                    icon={<Files size={24} strokeWidth={1.5} />}
                    active={activeView === 'explorer'}
                    onClick={() => onViewChange('explorer')}
                />
                <ActivityItem
                    icon={<Search size={24} strokeWidth={1.5} />}
                    active={activeView === 'search'}
                    onClick={() => onViewChange('search')}
                />
                <ActivityItem
                    icon={<Monitor size={24} strokeWidth={1.5} />}
                    active={activeView === 'serial'}
                    onClick={() => onViewChange('serial')}
                />
                {/* <ActivityItem
                    icon={<Terminal size={24} strokeWidth={1.5} />}
                    active={activeView === 'commands'}
                    onClick={() => onViewChange('commands')}
                /> */}
                <ActivityItem
                    icon={<GitGraph size={24} strokeWidth={1.5} />}
                    active={activeView === 'git'}
                    onClick={() => onViewChange('git')}
                />
                <ActivityItem
                    icon={<Box size={24} strokeWidth={1.5} />}
                    active={activeView === 'extensions'}
                    onClick={() => onViewChange('extensions')}
                />

                {/* Dynamic Plugins */}
                {plugins.filter(p => p.isActive && p.plugin.sidebarComponent).map(p => {
                    const Icon = p.plugin.icon;
                    return (
                        <ActivityItem
                            key={p.plugin.id}
                            icon={Icon ? <Icon size={24} /> : <Box size={24} />}
                            active={activeView === p.plugin.id}
                            onClick={() => onViewChange(p.plugin.id)}
                        />
                    );
                })}
            </div>

            <div className="flex flex-col gap-0">
                <ActivityItem
                    icon={<User size={24} strokeWidth={1.5} />}
                    onClick={() => alert('User profiles not implemented yet')}
                />

                <div className="relative" ref={menuRef}>
                    <ActivityItem
                        icon={<Settings size={24} strokeWidth={1.5} />}
                        active={isMenuOpen}
                        onClick={() => {
                            if (isMenuOpen) resetMenu();
                            else setIsMenuOpen(true);
                        }}
                    />

                    {isMenuOpen && (
                        <div className="absolute left-full bottom-0 ml-1 w-64 bg-[var(--vscode-bg)] border border-[var(--vscode-border)] shadow-lg rounded py-1 z-50">
                            {activeSubmenu === 'main' ? (
                                <>
                                    <div className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => alert('Settings not implemented')}>
                                        <span>Settings</span>
                                        <span className="text-[11px] opacity-60">Ctrl+,</span>
                                    </div>
                                    <div className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => alert('Extensions not implemented')}>
                                        <span>Extensions</span>
                                    </div>
                                    <div className="h-[1px] bg-[var(--vscode-border)] my-1 opacity-50"></div>
                                    <div className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => setActiveSubmenu('themes')}>
                                        <span>Color Theme</span>
                                        <span className="text-[11px] opacity-60">Ctrl+K Ctrl+T</span>
                                    </div>
                                    <div className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => alert('Run Update check')}>
                                        <span>Check for Updates...</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--vscode-fg)] opacity-50 uppercase tracking-wide flex items-center gap-2 cursor-pointer hover:text-[var(--vscode-accent)]" onClick={() => setActiveSubmenu('main')}>
                                        <span>← Back</span>
                                    </div>
                                    <div className="h-[1px] bg-[var(--vscode-border)] my-1 opacity-50"></div>
                                    <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--vscode-fg)] opacity-50 uppercase tracking-wide">
                                        Select Color Theme
                                    </div>
                                    <div
                                        className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => { setTheme('dark'); resetMenu(); }}
                                    >
                                        <span>Dark Modern</span>
                                        {theme === 'dark' && <Check size={14} />}
                                    </div>
                                    <div
                                        className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => { setTheme('light'); resetMenu(); }}
                                    >
                                        <span>Light Modern</span>
                                        {theme === 'light' && <Check size={14} />}
                                    </div>
                                    <div
                                        className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => { setTheme('hc'); resetMenu(); }}
                                    >
                                        <span>High Contrast</span>
                                        {theme === 'hc' && <Check size={14} />}
                                    </div>
                                    <div
                                        className="px-3 py-1.5 text-[13px] hover:bg-[var(--vscode-list-hover)] cursor-pointer flex items-center justify-between text-[var(--vscode-fg)]"
                                        onClick={() => { setTheme('one-dark-vivid'); resetMenu(); }}
                                    >
                                        <span>One Dark Vivid</span>
                                        {theme === 'one-dark-vivid' && <Check size={14} />}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
