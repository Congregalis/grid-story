import { Mark } from '@tiptap/react';

/**
 * TipTap mark for AI-generated text.
 * Renders with a light background and `data-source="ai"` attribute.
 * The mark decays when the paragraph is manually edited (see aiDecayPlugin).
 */
export const AiSourceMark = Mark.create({
  name: 'aiSource',

  addAttributes() {
    return {
      timestamp: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-source="ai"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const ts = HTMLAttributes.timestamp as string | null;
    const title = ts ? `AI 生成于 ${new Date(ts).toLocaleString('zh-CN')}` : 'AI 生成';
    return [
      'span',
      {
        'data-source': 'ai',
        'data-timestamp': ts ?? '',
        title,
        class: 'ai-source-mark',
      },
      0,
    ];
  },
});
