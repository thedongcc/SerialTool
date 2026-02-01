import { GitBranch, RefreshCw, AlertTriangle, Bell } from 'lucide-react';

export const StatusBar = () => {
    return (
        <div className="h-[22px] bg-[var(--vscode-statusbar)] flex items-center justify-between px-2 text-[12px] text-white select-none cursor-default">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 hover:bg-white/20 px-1 rounded-sm cursor-pointer">
                    <GitBranch size={12} />
                    <span>main</span>
                </div>
                <div className="flex items-center gap-1 hover:bg-white/20 px-1 rounded-sm cursor-pointer">
                    <RefreshCw size={12} />
                </div>
                <div className="flex items-center gap-2 hover:bg-white/20 px-1 rounded-sm cursor-pointer ml-1">
                    <div className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        <span>0</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        <span>0</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="hover:bg-white/20 px-1 rounded-sm cursor-pointer">
                    Ln 14, Col 52
                </div>
                <div className="hover:bg-white/20 px-1 rounded-sm cursor-pointer">
                    UTF-8
                </div>
                <div className="hover:bg-white/20 px-1 rounded-sm cursor-pointer">
                    TypeScript JSX
                </div>
                <div className="flex items-center gap-1 hover:bg-white/20 px-1 rounded-sm cursor-pointer">
                    <Bell size={12} />
                </div>
            </div>
        </div>
    );
};
