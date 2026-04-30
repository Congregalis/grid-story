import { useState } from 'react';
import {
  PixelButton,
  PixelDialog,
  PixelInput,
  PixelTextArea,
} from '@grid-story/pixel-kit';
import { api, ApiError } from '../../lib/api';
import type { OutlineRow } from './types';

interface GeneratedScene {
  title: string;
  summary: string;
}
interface GeneratedChapter extends GeneratedScene {
  scenes: GeneratedScene[];
}
interface GeneratedVolume extends GeneratedScene {
  chapters: GeneratedChapter[];
}
interface GeneratedArc extends GeneratedScene {
  volumes: GeneratedVolume[];
}
interface GeneratedOutline {
  arcs: GeneratedArc[];
}

interface GenerateResp {
  ok: boolean;
  bookId: string;
  counts: { arcs: number; volumes: number; chapters: number; scenes: number };
  outline: GeneratedOutline;
}

export interface AiGenerateDialogProps {
  open: boolean;
  bookId: string;
  /** 当前 book 已有的根节点数 — 决定写入时新 arcs 的起始 order */
  existingRootCount: number;
  onClose: () => void;
  onWritten: () => void;
}

type Phase = 'idle' | 'generating' | 'preview' | 'writing' | 'error';

/**
 * DFS 写入生成的大纲树。每层调 POST /bible/outlines，
 * 用上一层返回的 id 作为下一层的 parentId。失败时抛出，
 * 部分写入的节点留在 DB 里 —— 用户可以在 OutlineCanvas 手动清理。
 */
async function writeGeneratedTree(
  bookId: string,
  generated: GeneratedOutline,
  baseOrder: number,
  onProgress: (saved: number, total: number) => void,
): Promise<void> {
  const total = countNodes(generated);
  let saved = 0;
  const tick = async () => {
    saved += 1;
    onProgress(saved, total);
  };

  for (let i = 0; i < generated.arcs.length; i++) {
    const arc = generated.arcs[i];
    const arcRow = await api.post<OutlineRow>('/bible/outlines', {
      bookId,
      type: 'arc',
      title: arc.title,
      summary: arc.summary,
      parentId: null,
      order: baseOrder + i,
      notes: null,
    });
    await tick();

    for (let j = 0; j < arc.volumes.length; j++) {
      const vol = arc.volumes[j];
      const volRow = await api.post<OutlineRow>('/bible/outlines', {
        bookId,
        type: 'volume',
        title: vol.title,
        summary: vol.summary,
        parentId: arcRow.id,
        order: j,
        notes: null,
      });
      await tick();

      for (let k = 0; k < vol.chapters.length; k++) {
        const ch = vol.chapters[k];
        const chRow = await api.post<OutlineRow>('/bible/outlines', {
          bookId,
          type: 'chapter',
          title: ch.title,
          summary: ch.summary,
          parentId: volRow.id,
          order: k,
          notes: null,
        });
        await tick();

        for (let m = 0; m < ch.scenes.length; m++) {
          const sc = ch.scenes[m];
          await api.post<OutlineRow>('/bible/outlines', {
            bookId,
            type: 'scene',
            title: sc.title,
            summary: sc.summary,
            parentId: chRow.id,
            order: m,
            notes: null,
          });
          await tick();
        }
      }
    }
  }
}

function countNodes(g: GeneratedOutline): number {
  let n = 0;
  for (const arc of g.arcs) {
    n += 1;
    for (const vol of arc.volumes) {
      n += 1;
      for (const ch of vol.chapters) {
        n += 1 + ch.scenes.length;
      }
    }
  }
  return n;
}

export function AiGenerateDialog({
  open,
  bookId,
  existingRootCount,
  onClose,
  onWritten,
}: AiGenerateDialogProps) {
  const [idea, setIdea] = useState('');
  const [style, setStyle] = useState('文学性、克制、冷色调');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GenerateResp | null>(null);
  const [progress, setProgress] = useState<{ saved: number; total: number } | null>(null);

  const reset = () => {
    setIdea('');
    setPhase('idle');
    setError(null);
    setPreview(null);
    setProgress(null);
  };

  const close = () => {
    if (phase === 'generating' || phase === 'writing') return;
    onClose();
    // 保留输入但清进度，让用户重新打开能改
    setPhase('idle');
    setProgress(null);
  };

  const generate = async () => {
    if (!idea.trim()) return;
    setPhase('generating');
    setError(null);
    try {
      const resp = await api.post<GenerateResp>('/agent/outline/generate', {
        bookId,
        idea: idea.trim(),
        style: style.trim() || '文学性',
      });
      setPreview(resp);
      setPhase('preview');
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `后端 ${e.status}: ${typeof e.body === 'string' ? e.body : JSON.stringify(e.body).slice(0, 300)}`
          : (e as Error)?.message ?? '调用失败';
      setError(msg);
      setPhase('error');
    }
  };

  const write = async () => {
    if (!preview) return;
    setPhase('writing');
    setError(null);
    setProgress({ saved: 0, total: 0 });
    try {
      await writeGeneratedTree(
        bookId,
        preview.outline,
        existingRootCount,
        (saved, total) => setProgress({ saved, total }),
      );
      onWritten();
      reset();
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `写入失败 ${e.status}: ${typeof e.body === 'string' ? e.body : JSON.stringify(e.body).slice(0, 300)}`
          : (e as Error)?.message ?? '写入失败';
      setError(msg);
      setPhase('error');
    }
  };

  return (
    <PixelDialog
      open={open}
      onClose={close}
      title="AI 生成完整大纲"
      footer={
        phase === 'preview' ? (
          <>
            <PixelButton variant="ghost" onClick={() => setPhase('idle')}>
              重新生成
            </PixelButton>
            <PixelButton onClick={write}>写入大纲</PixelButton>
          </>
        ) : phase === 'generating' || phase === 'writing' ? (
          <PixelButton variant="ghost" disabled>
            {phase === 'generating' ? '生成中…' : '写入中…'}
          </PixelButton>
        ) : (
          <>
            <PixelButton variant="ghost" onClick={close}>
              取消
            </PixelButton>
            <PixelButton disabled={!idea.trim()} onClick={generate}>
              生成大纲
            </PixelButton>
          </>
        )
      }
    >
      <div className="space-y-3">
        {(phase === 'idle' || phase === 'error') && (
          <>
            <label className="block">
              <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">
                idea 一句话 *
              </span>
              <PixelTextArea
                rows={3}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="一个会望气的孤女追查师父失踪案，由北境一路追到雪夜城。"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">
                风格 / 基调
              </span>
              <PixelInput value={style} onChange={(e) => setStyle(e.target.value)} />
            </label>
            <p className="font-ui text-xs text-ink-mute">
              调用 <code className="font-mono">POST /agent/outline/generate</code>。
              OutlineAgent 会把当前 Bible + 已有大纲也喂给模型作上下文。
              典型耗时 1–3 min（取决于模型）。
            </p>
          </>
        )}

        {phase === 'generating' && (
          <p className="font-ui text-sm text-primary">
            正在生成 4 层大纲（arc → volume → chapter → scene）…
          </p>
        )}

        {phase === 'preview' && preview && (
          <div>
            <p className="font-ui text-sm text-success mb-3">
              ✓ 已生成 {preview.counts.arcs} 总纲 · {preview.counts.volumes} 卷 ·{' '}
              {preview.counts.chapters} 章 · {preview.counts.scenes} 场景
            </p>
            <div className="bg-surface-raised border-2 border-outline-soft rounded-sm p-3 max-h-72 overflow-auto pixel-scrollbar font-ui text-sm">
              {preview.outline.arcs.map((arc, i) => (
                <details key={i} open className="mb-2">
                  <summary className="cursor-pointer">
                    <span className="font-pixel text-pixel-sm bg-secondary text-on-primary px-1.5 py-0.5 mr-2">
                      总纲
                    </span>
                    <strong>{arc.title}</strong>
                    <p className="text-ink-soft text-xs mt-1 ml-1">{arc.summary}</p>
                  </summary>
                  <div className="ml-6 mt-1 space-y-2">
                    {arc.volumes.map((vol, j) => (
                      <details key={j} open>
                        <summary className="cursor-pointer">
                          <span className="font-pixel text-pixel-sm bg-primary text-on-primary px-1.5 py-0.5 mr-2">
                            卷
                          </span>
                          {vol.title}
                          <p className="text-ink-soft text-xs mt-1 ml-1">{vol.summary}</p>
                        </summary>
                        <div className="ml-6 mt-1 space-y-1">
                          {vol.chapters.map((ch, k) => (
                            <details key={k}>
                              <summary className="cursor-pointer">
                                <span className="font-pixel text-pixel-sm bg-success text-on-primary px-1.5 py-0.5 mr-2">
                                  章
                                </span>
                                {ch.title}
                                <span className="text-ink-soft text-xs ml-2">
                                  ({ch.scenes.length} 场景)
                                </span>
                              </summary>
                              <ul className="ml-6 mt-1 list-disc list-inside text-xs text-ink-soft">
                                {ch.scenes.map((s, m) => (
                                  <li key={m}>
                                    <strong>{s.title}</strong> — {s.summary}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <p className="mt-2 font-ui text-xs text-ink-mute">
              点「写入大纲」会把这棵树作为新根追加到当前 book，
              已有节点不会被覆盖。
            </p>
          </div>
        )}

        {phase === 'writing' && progress && (
          <div>
            <p className="font-ui text-sm text-primary mb-2">
              正在写入… {progress.saved} / {progress.total}
            </p>
            <div className="h-2 bg-outline-soft">
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width: `${
                    progress.total > 0 ? Math.round((progress.saved / progress.total) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="font-ui text-sm text-danger border-2 border-danger px-3 py-2 break-words">
            {error}
          </p>
        )}
      </div>
    </PixelDialog>
  );
}
