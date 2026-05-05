export const rewriteModes = [
  { mode: 'expand', label: '扩写' },
  { mode: 'condense', label: '缩写' },
  { mode: 'polish', label: '润色' },
  { mode: 'style', label: '换风格' },
  { mode: 'pov', label: '换视角' },
] as const;

export type RewriteMode = (typeof rewriteModes)[number]['mode'];

export function defaultRewriteInstruction(mode: RewriteMode): string {
  switch (mode) {
    case 'expand':
      return '在不改变既有事实的前提下扩写，增加动作、感官、潜台词和场景细节。';
    case 'condense':
      return '压缩文字，保留关键事实、情绪和伏笔，删除重复与松散描写。';
    case 'polish':
      return '润色文字，让表达更流畅、更有画面感，保持原意和情节不变。';
    case 'style':
      return '改成更冷峻、克制、有张力的风格，保持事实和情节不变。';
    case 'pov':
      return '改成第三人称限知视角，保持事实、情节和人物动机不变。';
  }
}
