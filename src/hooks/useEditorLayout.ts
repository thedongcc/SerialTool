import { useState, useCallback } from 'react';

export interface EditorGroup {
    id: string;
    views: string[]; // List of Session IDs
    activeViewId: string | null;
}

export const useEditorLayout = () => {
    const [groups, setGroups] = useState<EditorGroup[]>([
        { id: 'group-0', views: [], activeViewId: null }
    ]);
    const [activeGroupId, setActiveGroupId] = useState<string>('group-0');

    const openSession = useCallback((sessionId: string, groupId?: string) => {
        setGroups(prev => {
            const targetGroupId = groupId || activeGroupId;
            // Ensure target group exists, otherwise fallback to first or create? 
            // For now assume it exists.

            return prev.map(group => {
                if (group.id === targetGroupId) {
                    if (group.views.includes(sessionId)) {
                        return { ...group, activeViewId: sessionId };
                    }
                    return {
                        ...group,
                        views: [...group.views, sessionId],
                        activeViewId: sessionId
                    };
                }
                return group;
            });
        });
        if (groupId) setActiveGroupId(groupId);
    }, [activeGroupId]);

    const closeView = useCallback((groupId: string, sessionId: string) => {
        setGroups(prev => prev.map(group => {
            if (group.id === groupId) {
                const newViews = group.views.filter(id => id !== sessionId);
                let newActiveId = group.activeViewId;
                if (newActiveId === sessionId) {
                    // Activate neighbor or null
                    const index = group.views.indexOf(sessionId);
                    if (newViews.length > 0) {
                        // Try same index, or last
                        newActiveId = newViews[Math.min(index, newViews.length - 1)];
                    } else {
                        newActiveId = null;
                    }
                }
                return { ...group, views: newViews, activeViewId: newActiveId };
            }
            return group;
        }));
    }, []);

    const splitGroup = useCallback((sourceGroupId: string) => {
        setGroups(prev => {
            const index = prev.findIndex(g => g.id === sourceGroupId);
            if (index === -1) return prev;

            const sourceGroup = prev[index];
            const newGroupId = `group-${Date.now()}`;
            const newGroup: EditorGroup = {
                id: newGroupId,
                // VS Code copies the active view to the new group
                views: sourceGroup.activeViewId ? [sourceGroup.activeViewId] : [],
                activeViewId: sourceGroup.activeViewId
            };

            const newGroups = [...prev];
            newGroups.splice(index + 1, 0, newGroup);
            return newGroups;
        });
        // We probably want to activate the new group?
        // setActiveGroupId(newGroupId); // Need to do this in effect or result
    }, []);

    const closeGroup = useCallback((groupId: string) => {
        setGroups(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter(g => g.id !== groupId);
        });
        setActiveGroupId(prev => prev === groupId ? 'group-0' : prev); // Fallback logic could be better
    }, []);

    const moveView = useCallback((fromGroupId: string, toGroupId: string, sessionId: string, newIndex?: number) => {
        setGroups(prev => {
            // Remove from source
            const sourceGroup = prev.find(g => g.id === fromGroupId);
            if (!sourceGroup || !sourceGroup.views.includes(sessionId)) return prev;

            // Add to target
            // If dragging to same group, just reorder
            if (fromGroupId === toGroupId) {
                const newViews = [...sourceGroup.views];
                const oldIndex = newViews.indexOf(sessionId);
                newViews.splice(oldIndex, 1);
                const safeIndex = newIndex !== undefined ? newIndex : newViews.length;
                newViews.splice(safeIndex, 0, sessionId);

                return prev.map(g => g.id === fromGroupId ? { ...g, views: newViews } : g);
            }

            // Cross group
            const newPrev = prev.map(g => {
                if (g.id === fromGroupId) {
                    const newViews = g.views.filter(v => v !== sessionId);
                    // Determine new active for source
                    let newActive = g.activeViewId;
                    if (newActive === sessionId) {
                        newActive = newViews.length > 0 ? newViews[newViews.length - 1] : null; // Simple fallback
                    }
                    return { ...g, views: newViews, activeViewId: newActive };
                }
                if (g.id === toGroupId) {
                    const newViews = [...g.views];
                    // If moving view already exists in target? VS Code focuses it.
                    // But here we might want to strictly move? 
                    // DnD implies strict move. If it exists, we remove old instance?
                    if (newViews.includes(sessionId)) {
                        // already there, just reorder?
                        // For simplicity, filter out existing to duplications (unless we support split same buffer twice in same group?)
                        // VS Code doesn't allow same file twice in same group usually.
                        const existingIdx = newViews.indexOf(sessionId);
                        newViews.splice(existingIdx, 1);
                    }

                    const safeIndex = newIndex !== undefined ? newIndex : newViews.length;
                    newViews.splice(safeIndex, 0, sessionId);
                    return { ...g, views: newViews, activeViewId: sessionId };
                }
                return g;
            });
            return newPrev;
        });
        setActiveGroupId(toGroupId);
    }, []);

    return {
        groups,
        activeGroupId,
        setActiveGroupId,
        openSession,
        closeView,
        splitGroup,
        closeGroup,
        moveView
    };
};
