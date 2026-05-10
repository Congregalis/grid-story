import { PixelButton } from '@grid-story/pixel-kit';
import type { Chapter } from '@grid-story/schema';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../../../lib/toast';
import type { StageContext } from '../types';

interface PublishStageProps {
  ctx: StageContext;
  bookId: string;
}

export function PublishStage({ ctx, bookId }: PublishStageProps) {
  const finalChapters = useMemo(
    () => groupLatestPerRoot(ctx.chapters).filter((c) => c.status === 'final' || c.status === 'published'),
    [ctx.chapters],
  );
  const totalWords = finalChapters.reduce((sum, c) => sum + c.wordCount, 0);

  const exportMarkdown = () => {
    if (finalChapters.length === 0) {
      toast.info('还没有 final 章节可导出');
      return;
    }
    const md = buildBookMarkdown(ctx.book.title, finalChapters);
    triggerDownload(`${ctx.book.title || 'book'}.md`, md, 'text/markdown');
    toast.success(`已下载 ${finalChapters.length} 章正文`);
  };

  const exportBibleJson = () => {
    const payload = {
      book: ctx.book,
      characters: ctx.characters,
      decisionProfiles: ctx.decisionProfiles,
      drives: ctx.drives,
      relationships: ctx.relationships,
      worldVariables: ctx.worldVariables,
      outlines: ctx.outlines,
    };
    const json = JSON.stringify(payload, null, 2);
    triggerDownload(
      `${ctx.book.title || 'book'}-bible.json`,
      json,
      'application/json',
    );
    toast.success('Bible JSON 已下载');
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
      <header>
        <h1 className="font-pixel text-pixel-lg mb-1">📦 出版</h1>
        <p className="font-ui text-sm text-ink-soft">
          浏览自动生成的 Memory Wiki，导出全文与 Bible 备份。
        </p>
      </header>

      {/* 概览 */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="finalize 章节" value={finalChapters.length} suffix="章" />
        <Stat label="正文总字数" value={totalWords} suffix="字" />
        <Stat label="设定条目" value={ctx.characters.length + ctx.outlines.length} suffix="条" />
      </section>

      {/* 导出 */}
      <section className="border-2 border-outline rounded-md bg-surface p-4 shadow-pixel-1 space-y-3">
        <h2 className="font-pixel text-pixel-md">导出</h2>
        <div className="flex flex-wrap gap-2">
          <PixelButton
            disabled={finalChapters.length === 0}
            onClick={exportMarkdown}
            title="把所有 final 章节拼成单一 markdown 文件下载"
          >
            ⬇ 全文 Markdown
          </PixelButton>
          <PixelButton variant="ghost" onClick={exportBibleJson}>
            ⬇ Bible JSON 备份
          </PixelButton>
        </div>
        {finalChapters.length === 0 && (
          <p className="font-ui text-xs text-warning">
            还没有 final 章节。回到 ④ 写作把至少一章状态推到 final，再回来导出。
          </p>
        )}
      </section>

      {/* Wiki 入口 */}
      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-4 space-y-2">
        <h2 className="font-pixel text-pixel-md">📚 Memory Wiki</h2>
        <p className="font-ui text-xs text-ink-soft">
          每次章节 finalize 后，IngestPipeline 自动抽取 wiki 页面（角色 / 地点 / 时间线 /
          伏笔追踪）。点下方进入完整浏览器：
        </p>
        <Link
          to={`/books/${bookId}/expert/wiki`}
          className="inline-block font-pixel text-pixel-sm border-2 border-primary rounded-sm px-3 py-1 bg-primary-soft text-primary hover:bg-primary hover:text-on-primary"
        >
          打开 Wiki 浏览器 →
        </Link>
      </section>

      {/* 章节列表 */}
      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-4 space-y-2">
        <h2 className="font-pixel text-pixel-md">已完成章节</h2>
        {finalChapters.length === 0 ? (
          <p className="font-ui text-sm text-ink-mute">尚未 finalize 任何章节。</p>
        ) : (
          <ul className="space-y-1">
            {finalChapters.map((ch) => (
              <li
                key={ch.chapterRootId}
                className="flex items-center gap-2 font-ui text-sm border border-outline-soft rounded-sm bg-surface px-3 py-1.5"
              >
                <span className="font-pixel text-pixel-sm">第 {ch.order} 章</span>
                <span className="truncate flex-1">{ch.title}</span>
                <span className="font-ui text-[11px] text-ink-mute">{ch.wordCount} 字</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
      <div className="font-ui text-xs text-ink-mute">{label}</div>
      <div className="font-pixel text-pixel-lg text-ink mt-1">
        {value.toLocaleString()}
        {suffix && <span className="ml-1 text-pixel-sm text-ink-mute">{suffix}</span>}
      </div>
    </div>
  );
}

function buildBookMarkdown(title: string, chapters: Chapter[]): string {
  const lines: string[] = [`# ${title || '未命名作品'}`, ''];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  for (const ch of sorted) {
    lines.push('');
    lines.push(`## 第 ${ch.order} 章 · ${ch.title}`);
    lines.push('');
    lines.push(stripHtml(ch.content));
  }
  return lines.join('\n');
}

function stripHtml(html: string): string {
  // 简单去 HTML 标签，保留段落分隔；TipTap 输出含 <p>...</p>
  return html
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function groupLatestPerRoot(chapters: Chapter[]): Chapter[] {
  const map = new Map<string, Chapter>();
  for (const ch of chapters) {
    const existing = map.get(ch.chapterRootId);
    if (!existing || ch.version > existing.version) {
      map.set(ch.chapterRootId, ch);
    }
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}
