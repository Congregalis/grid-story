export interface ParagraphAnnotation {
  id: string;
  paragraphIndex: number;
  quote: string;
  content: string;
  createdAt: string;
}

interface ParagraphAnnotationPanelProps {
  paragraphs: string[];
  annotations: ParagraphAnnotation[];
  onAdd: (paragraphIndex: number, quote: string, content: string) => void;
  onResolve: (id: string) => void;
  onNavigate: (quote: string) => void;
  onRewriteParagraph: (text: string) => void;
}

export function ParagraphAnnotationPanel({
  paragraphs,
  annotations,
  onAdd,
  onResolve,
  onNavigate,
  onRewriteParagraph,
}: ParagraphAnnotationPanelProps) {
  return (
    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1">
      <div className="px-3 py-2 border-b-2 border-outline-soft">
        <div className="font-pixel text-pixel-sm">段落批注</div>
        <div className="font-ui text-[11px] text-ink-mute mt-1">
          {annotations.length} 条开放批注
        </div>
      </div>
      <div className="max-h-[600px] overflow-y-auto pixel-scrollbar">
        {paragraphs.length === 0 ? (
          <div className="font-ui text-xs text-ink-mute text-center p-3">暂无正文段落。</div>
        ) : (
          paragraphs.map((paragraph, index) => (
            <ParagraphAnnotationItem
              key={paragraphKey(paragraph)}
              paragraph={paragraph}
              index={index}
              annotations={annotations.filter((item) => item.paragraphIndex === index)}
              onAdd={onAdd}
              onResolve={onResolve}
              onNavigate={onNavigate}
              onRewriteParagraph={onRewriteParagraph}
            />
          ))
        )}
      </div>
    </div>
  );
}

function paragraphKey(paragraph: string): string {
  let hash = 0;
  for (const char of paragraph) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `paragraph-${hash.toString(16)}`;
}

function ParagraphAnnotationItem({
  paragraph,
  index,
  annotations,
  onAdd,
  onResolve,
  onNavigate,
  onRewriteParagraph,
}: {
  paragraph: string;
  index: number;
  annotations: ParagraphAnnotation[];
  onAdd: (paragraphIndex: number, quote: string, content: string) => void;
  onResolve: (id: string) => void;
  onNavigate: (quote: string) => void;
  onRewriteParagraph: (text: string) => void;
}) {
  const preview = paragraph.length > 70 ? `${paragraph.slice(0, 70)}...` : paragraph;

  return (
    <div className="px-3 py-2 border-b border-outline-soft last:border-b-0">
      <button
        type="button"
        className="font-ui text-[11px] text-ink-soft leading-relaxed text-left hover:text-primary"
        onClick={() => onNavigate(paragraph)}
      >
        #{index + 1} {preview}
      </button>
      <div className="flex gap-1.5 mt-1.5">
        <button
          type="button"
          className="font-pixel text-[10px] text-primary hover:bg-primary-soft rounded-sm px-2 py-0.5 border border-primary"
          onClick={() => {
            const content = prompt('批注内容');
            if (content?.trim()) onAdd(index, paragraph, content.trim());
          }}
        >
          批注
        </button>
        <button
          type="button"
          className="font-pixel text-[10px] text-ink-mute hover:bg-surface-raised rounded-sm px-2 py-0.5 border border-outline-soft"
          onClick={() => onRewriteParagraph(paragraph)}
        >
          改写
        </button>
      </div>
      {annotations.length > 0 && (
        <div className="mt-2 space-y-1">
          {annotations.map((annotation) => (
            <div key={annotation.id} className="bg-surface-raised border border-outline-soft p-1.5">
              <p className="font-ui text-[11px] text-ink leading-relaxed">{annotation.content}</p>
              <div className="flex gap-1.5 mt-1">
                <button
                  type="button"
                  className="font-pixel text-[10px] text-primary hover:underline"
                  onClick={() => onNavigate(annotation.quote)}
                >
                  定位
                </button>
                <button
                  type="button"
                  className="font-pixel text-[10px] text-ink-mute hover:underline"
                  onClick={() => onResolve(annotation.id)}
                >
                  完成
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
