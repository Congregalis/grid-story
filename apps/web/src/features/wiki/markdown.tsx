import { type ReactNode, isValidElement, Children, cloneElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const CITATION_RE = /\[(ch-\d+(?:\s*:\s*(?:explicit|implied|inferred))?|bible|author-note|implied|inferred|explicit)\]/gi;
const AUTHOR_NOTE_BLOCK_RE = /<!--\s*author-note start\s*-->([\s\S]*?)<!--\s*author-note end\s*-->/g;

interface MarkdownSegment {
  kind: 'markdown' | 'author-note';
  content: string;
}

export function splitAuthorNoteBlocks(raw: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let cursor = 0;
  AUTHOR_NOTE_BLOCK_RE.lastIndex = 0;
  for (let match = AUTHOR_NOTE_BLOCK_RE.exec(raw); match; match = AUTHOR_NOTE_BLOCK_RE.exec(raw)) {
    if (match.index > cursor) {
      segments.push({ kind: 'markdown', content: raw.slice(cursor, match.index) });
    }
    segments.push({ kind: 'author-note', content: match[1].trim() });
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) {
    segments.push({ kind: 'markdown', content: raw.slice(cursor) });
  }
  return segments;
}

function preprocessWikilinks(content: string): string {
  return content.replace(WIKILINK_RE, (_, target: string, alias?: string) => {
    const text = (alias ?? target).trim();
    const slug = encodeURIComponent(target.trim());
    return `[${text}](wiki:/${slug})`;
  });
}

interface WikiMarkdownProps {
  content: string;
  bookId: string;
  onNavigate?: (target: string) => void;
}

export function WikiMarkdown({ content, bookId, onNavigate }: WikiMarkdownProps) {
  const segments = splitAuthorNoteBlocks(content);
  return (
    <div className="space-y-4">
      {segments.map((segment, idx) => {
        if (segment.kind === 'author-note') {
          return (
            <AuthorNote key={`an-${idx}`} bookId={bookId} onNavigate={onNavigate}>
              {segment.content}
            </AuthorNote>
          );
        }
        const prepared = preprocessWikilinks(segment.content);
        return (
          <ReactMarkdown
            // biome-ignore lint/suspicious/noArrayIndexKey: markdown segments are stable per render.
            key={`md-${idx}`}
            remarkPlugins={[remarkGfm]}
            components={mdComponents(bookId, onNavigate)}
          >
            {prepared}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

function AuthorNote({
  bookId,
  onNavigate,
  children,
}: {
  bookId: string;
  onNavigate?: (target: string) => void;
  children: string;
}) {
  const prepared = preprocessWikilinks(children);
  return (
    <aside
      className="relative border-2 border-secondary bg-secondary-soft text-ink rounded-md p-4 pl-5 shadow-pixel-1"
      aria-label="作者备注"
    >
      <span className="absolute -top-3 left-3 px-2 bg-secondary text-on-secondary font-pixel text-pixel-sm border-2 border-outline rounded-sm">
        作者备注
      </span>
      <div className="font-prose text-[15px] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={mdComponents(bookId, onNavigate)}
        >
          {prepared}
        </ReactMarkdown>
      </div>
    </aside>
  );
}

function mdComponents(bookId: string, onNavigate?: (target: string) => void) {
  void bookId;
  return {
    h1: (props: { children?: ReactNode }) => (
      <h1 className="font-prose font-semibold text-2xl text-ink mt-2 mb-4 pb-2 border-b-2 border-outline-soft">
        {decorateChildren(props.children)}
      </h1>
    ),
    h2: (props: { children?: ReactNode }) => (
      <h2 className="font-prose font-semibold text-xl text-ink mt-6 mb-3">
        {decorateChildren(props.children)}
      </h2>
    ),
    h3: (props: { children?: ReactNode }) => (
      <h3 className="font-prose font-semibold text-lg text-ink mt-5 mb-2">
        {decorateChildren(props.children)}
      </h3>
    ),
    h4: (props: { children?: ReactNode }) => (
      <h4 className="font-pixel text-pixel-md text-ink-soft mt-4 mb-2">
        {decorateChildren(props.children)}
      </h4>
    ),
    p: (props: { children?: ReactNode }) => (
      <p className="font-prose text-[16px] leading-[1.85] text-ink">
        {decorateChildren(props.children)}
      </p>
    ),
    ul: (props: { children?: ReactNode }) => (
      <ul className="list-disc list-outside pl-6 space-y-1.5 font-prose text-[16px] leading-[1.7] text-ink">
        {props.children}
      </ul>
    ),
    ol: (props: { children?: ReactNode }) => (
      <ol className="list-decimal list-outside pl-6 space-y-1.5 font-prose text-[16px] leading-[1.7] text-ink">
        {props.children}
      </ol>
    ),
    li: (props: { children?: ReactNode }) => <li>{decorateChildren(props.children)}</li>,
    strong: (props: { children?: ReactNode }) => (
      <strong className="font-semibold text-ink">{decorateChildren(props.children)}</strong>
    ),
    em: (props: { children?: ReactNode }) => (
      <em className="italic text-ink-soft">{decorateChildren(props.children)}</em>
    ),
    code: (props: { children?: ReactNode; className?: string }) => {
      // Inline code only — no syntax highlighting needed.
      return (
        <code className="font-mono text-[13px] bg-surface-raised border border-outline-soft rounded-sm px-1 py-0.5">
          {props.children}
        </code>
      );
    },
    pre: (props: { children?: ReactNode }) => (
      <pre className="font-mono text-[13px] bg-surface-raised border-2 border-outline rounded-sm p-3 overflow-x-auto">
        {props.children}
      </pre>
    ),
    table: (props: { children?: ReactNode }) => (
      <div className="overflow-x-auto pixel-scrollbar">
        <table className="w-full border-collapse border-2 border-outline font-ui text-sm">
          {props.children}
        </table>
      </div>
    ),
    thead: (props: { children?: ReactNode }) => (
      <thead className="bg-surface-raised">{props.children}</thead>
    ),
    th: (props: { children?: ReactNode }) => (
      <th className="border border-outline-soft px-3 py-2 text-left font-pixel text-pixel-sm text-ink-soft">
        {decorateChildren(props.children)}
      </th>
    ),
    td: (props: { children?: ReactNode }) => (
      <td className="border border-outline-soft px-3 py-2 align-top">
        {decorateChildren(props.children)}
      </td>
    ),
    blockquote: (props: { children?: ReactNode }) => (
      <blockquote className="border-l-4 border-primary bg-primary-soft/50 pl-4 py-1 italic text-ink-soft">
        {props.children}
      </blockquote>
    ),
    a: (props: { children?: ReactNode; href?: string }) => {
      const href = props.href ?? '';
      const isWikilink = href.startsWith('wiki:/');
      if (isWikilink) {
        const target = decodeURIComponent(href.slice('wiki:/'.length));
        return (
          <button
            type="button"
            onClick={() => onNavigate?.(target)}
            className="text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover hover:bg-primary-soft px-0.5 -mx-0.5 rounded-sm font-pixel text-pixel-md"
            data-wikilink-target={target}
          >
            {props.children}
          </button>
        );
      }
      // External link
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary-hover"
        >
          {props.children}
        </a>
      );
    },
    hr: () => <hr className="my-6 border-t-2 border-outline-soft" />,
  };
}

/**
 * Walk children: every plain string gets citation tags wrapped in styled spans.
 * Non-string children pass through unchanged.
 */
function decorateChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === 'string') {
      return decorateCitationsInString(child, idx);
    }
    if (isValidElement(child)) {
      const props = child.props as { children?: ReactNode };
      if (props.children !== undefined) {
        return cloneElement(child, undefined, decorateChildren(props.children));
      }
    }
    return child;
  });
}

function decorateCitationsInString(text: string, keyBase: number): ReactNode {
  CITATION_RE.lastIndex = 0;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  for (let match = CITATION_RE.exec(text); match; match = CITATION_RE.exec(text)) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    parts.push(<CitationTag key={`c-${keyBase}-${i++}`}>{match[1]}</CitationTag>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts.length === 1 && typeof parts[0] === 'string' ? text : <>{parts}</>;
}

function CitationTag({ children }: { children: string }) {
  const text = children.trim();
  const lower = text.toLowerCase();
  let tone:
    | 'chapter-explicit'
    | 'chapter-implied'
    | 'chapter-inferred'
    | 'bible'
    | 'author-note'
    | 'plain' = 'plain';

  if (lower.startsWith('ch-')) {
    if (lower.includes('inferred')) tone = 'chapter-inferred';
    else if (lower.includes('implied')) tone = 'chapter-implied';
    else tone = 'chapter-explicit';
  } else if (lower === 'bible') {
    tone = 'bible';
  } else if (lower === 'author-note') {
    tone = 'author-note';
  } else if (lower === 'inferred') {
    tone = 'chapter-inferred';
  } else if (lower === 'implied') {
    tone = 'chapter-implied';
  } else if (lower === 'explicit') {
    tone = 'chapter-explicit';
  }

  const palette: Record<typeof tone, string> = {
    'chapter-explicit': 'bg-success/15 text-success border-success/40',
    'chapter-implied': 'bg-warning/15 text-warning border-warning/40',
    'chapter-inferred': 'bg-danger/10 text-danger border-danger/40',
    bible: 'bg-primary-soft text-primary border-primary/40',
    'author-note': 'bg-secondary-soft text-secondary border-secondary/40',
    plain: 'bg-surface-raised text-ink-soft border-outline-soft',
  };

  return (
    <span
      className={`inline-flex items-center font-pixel text-pixel-sm align-middle mx-0.5 px-1.5 py-px border rounded-sm ${palette[tone]}`}
      data-citation={text}
    >
      [{text}]
    </span>
  );
}
