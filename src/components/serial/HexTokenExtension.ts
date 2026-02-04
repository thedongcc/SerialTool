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

    onCreate() {
        console.log('HexToken Extension Created');
    },

    group: 'inline',

    inline: true,

    atom: false, // Critical: Allows content

    content: 'inline*', // Allows text and other serialTokens (which are inline) in any order

    draggable: false,

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
            {
                tag: 'span[data-token-type="hex"]',
                getAttrs: (node: HTMLElement) => {
                    console.log('HexToken parseHTML: Parsing element', {
                        id: node.getAttribute('data-token-id'),
                        innerHTML: node.innerHTML,
                        textContent: node.textContent
                    });
                    return {}; // Return attrs (id, type, config are handled by attribute parseHTML)
                }
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // CRITICAL: 0 = content hole where child nodes will be rendered
        return ['span', mergeAttributes(HTMLAttributes), 0];
    },

    addNodeView() {
        return ({ node, getPos, editor }) => {
            // Create container
            const dom = document.createElement('span');
            dom.className = 'inline-flex items-center align-middle mx-0.5';
            dom.style.cssText = 'border: 1px solid #4c4c4c; border-radius: 3px; background-color: #2d2d2d;';
            dom.setAttribute('data-token-id', node.attrs.id);
            dom.setAttribute('data-token-type', 'hex');

            // Create label (non-editable)
            const label = document.createElement('span');
            label.contentEditable = 'false';
            label.className = 'shrink-0 bg-[#3c3c3c] text-[#9cdcfe] text-[10px] font-mono px-1 py-0.5 cursor-pointer hover:bg-[#505050] border-r border-[#4c4c4c] select-none';
            label.style.userSelect = 'none';
            label.textContent = `${node.attrs.config?.byteWidth || 1}B`;
            label.title = 'Click to configure';
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                const rect = label.getBoundingClientRect();
                const event = new CustomEvent('serial-token-click', {
                    detail: {
                        id: node.attrs.id,
                        type: 'hex',
                        config: node.attrs.config,
                        x: rect.left,
                        y: rect.bottom,
                        pos: typeof getPos === 'function' ? getPos() : 0
                    }
                });
                window.dispatchEvent(event);
            });
            dom.appendChild(label);

            // Create contentDOM (editable area) - THIS IS THE KEY
            const contentDOM = document.createElement('span');
            contentDOM.className = 'px-1 min-w-[40px] font-mono text-[13px] outline-none';
            contentDOM.style.cssText = 'color: var(--st-input-text, #d4d4d4); min-height: 1.2em; display: inline-block;';
            dom.appendChild(contentDOM);

            return {
                dom,
                contentDOM, // CRITICAL: This tells Prosemirror where to render content
                update: (updatedNode) => {
                    if (updatedNode.type.name !== 'hexToken') return false;
                    label.textContent = `${updatedNode.attrs.config?.byteWidth || 1}B`;
                    return true;
                }
            };
        };
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
                            .insertContent(state.schema.nodes[this.name].create(
                                { id, type: 'hex', config },
                                slice.content
                            ))
                            .run();
                    }
        };
    },
});
