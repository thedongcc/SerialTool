import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SerialTokenComponent } from './SerialTokenComponent';

export interface HexTokenOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        hexToken: {
            insertHexToken: (options: { config: any, content?: any }) => ReturnType;
            toggleHexToken: (options: { config: any }) => ReturnType;
        };
    }
}

export const HexToken = Node.create<HexTokenOptions>({
    name: 'hexToken', // Distinct from serialToken to handle schema differences (content allowed)

    group: 'inline',

    inline: true,

    atom: false, // Critical: Allows content

    content: 'inline*', // Allows text and other serialTokens (which are inline) in any order

    draggable: true,

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-token-id'),
                renderHTML: attributes => ({
                    'data-token-id': attributes.id,
                }),
            },
            type: {
                default: 'hex',
                renderHTML: () => ({
                    'data-token-type': 'hex',
                }),
            },
            config: {
                default: { byteWidth: 1 },
                parseHTML: element => {
                    const attr = element.getAttribute('data-token-config');
                    try {
                        return attr ? JSON.parse(decodeURIComponent(attr)) : { byteWidth: 1 };
                    } catch {
                        return { byteWidth: 1 };
                    }
                },
                renderHTML: attributes => ({
                    'data-token-config': encodeURIComponent(JSON.stringify(attributes.config)),
                }),
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-token-type="hex"]' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes), 0]; // 0 = Render content hole
    },

    addNodeView() {
        return ReactNodeViewRenderer(SerialTokenComponent);
    },

    addCommands() {
        return {
            insertHexToken:
                ({ config, content }) =>
                    ({ chain }) => {
                        const id = `token-hex-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                        return chain()
                            .insertContent({
                                type: this.name,
                                attrs: { id, type: 'hex', config },
                                content: content || []
                            })
                            .run();
                    },
            toggleHexToken:
                ({ config }) =>
                    ({ chain, state, commands }) => {
                        // If selection is empty, insert empty. If not, wrap.
                        const { from, to } = state.selection;
                        if (from === to) {
                            return commands.insertHexToken({ config });
                        }

                        // Wrapping inline content is tricky in TipTap if using 'toggleWrap' for custom nodes.
                        // Ideally we use command to wrap selection.
                        const id = `token-hex-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                        // We can't easily use "toggleWrap" for inline nodes that aren't marks.
                        // But we can use replaceSelectionWith based on content.
                        // Or use 'setNode' if it was a mark? No.
                        // Let's trying creating the node with the CURRENT selection content?
                        // Slice selection
                        const slice = state.selection.content();
                        return chain()
                            .replaceSelectionWith(state.schema.nodes[this.name].create(
                                { id, type: 'hex', config },
                                slice
                            ))
                            .run();
                    }
        };
    },
});
