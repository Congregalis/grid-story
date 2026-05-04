import { PixelButton, PixelDialog, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { OutlineType } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AiGenerateDialog } from '../features/outline/AiGenerateDialog';
import { type CardActions, OutlineCard, RootDropZone } from '../features/outline/OutlineCard';
import {
  CHILD_TYPE,
  type OutlineNode,
  type OutlineRow,
  type OutlineTreeResponse,
  TYPE_LABEL,
} from '../features/outline/types';
import { api, formatApiError } from '../lib/api';
import { useBookId } from '../lib/book';
import { toast } from '../lib/toast';

interface AddDraft {
  parentId: string | null;
  type: OutlineType;
  title: string;
  summary: string;
}

interface RenameDraft {
  id: string;
  title: string;
  summary: string;
}

function flatten(roots: OutlineNode[]): OutlineRow[] {
  const out: OutlineRow[] = [];
  const walk = (n: OutlineNode) => {
    out.push(n.node);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

function siblingsOf(rows: OutlineRow[], parentId: string | null): OutlineRow[] {
  return rows.filter((r) => r.parentId === parentId).sort((a, b) => a.order - b.order);
}

export default function OutlineCanvas() {
  const [bookId] = useBookId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const [renameDraft, setRenameDraft] = useState<RenameDraft | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const treeQuery = useQuery({
    queryKey: ['outline-tree', bookId],
    queryFn: () =>
      api.get<OutlineTreeResponse>(`/outline/tree?bookId=${encodeURIComponent(bookId)}`),
  });

  const roots = treeQuery.data?.roots ?? [];
  const flat = useMemo(() => flatten(roots), [roots]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['outline-tree', bookId] });

  const createNode = useMutation({
    mutationFn: async (draft: AddDraft) => {
      const sibs = siblingsOf(flat, draft.parentId);
      return api.post<OutlineRow>('/bible/outlines', {
        bookId,
        type: draft.type,
        title: draft.title.trim(),
        summary: draft.summary.trim() || null,
        parentId: draft.parentId,
        order: sibs.length,
        notes: null,
      });
    },
    onSuccess: (created) => {
      invalidate();
      setAddDraft(null);
      toast.success(`已创建：${created.title}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '创建失败，请稍后重试')),
  });

  const renameMutation = useMutation({
    mutationFn: async (draft: RenameDraft) =>
      api.put<OutlineRow>(`/bible/outlines/${draft.id}`, {
        title: draft.title.trim(),
        summary: draft.summary.trim() || null,
      }),
    onSuccess: () => {
      invalidate();
      setRenameDraft(null);
      toast.success('已保存');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '保存失败，请稍后重试')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // 后端 cascade 不一定有；前端先递归删子，再删自身
      const collectDescendants = (root: OutlineRow): OutlineRow[] => {
        const childs = flat.filter((r) => r.parentId === root.id);
        return childs.flatMap((c) => [c, ...collectDescendants(c)]);
      };
      const target = flat.find((r) => r.id === id);
      if (!target) return;
      const descendants = collectDescendants(target);
      // 从叶到根删
      for (const d of [...descendants].reverse()) {
        await api.del(`/bible/outlines/${d.id}`);
      }
      await api.del(`/bible/outlines/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast.success('已删除');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '删除失败，请稍后重试')),
  });

  const moveMutation = useMutation({
    mutationFn: async (vars: { id: string; parentId: string | null; order: number }) =>
      api.post<OutlineRow>('/outline/move', vars),
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error(formatApiError(e, '移动失败，请稍后重试')),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => api.post('/outline/reorder', { orderedIds }),
    onSuccess: () => invalidate(),
  });

  const actions: CardActions = {
    onAddChild: (parent) => {
      const childType = CHILD_TYPE[parent.type];
      if (!childType) return;
      setAddDraft({ parentId: parent.id, type: childType, title: '', summary: '' });
    },
    onDelete: (id) => deleteMutation.mutate(id),
    onRename: (row) => setRenameDraft({ id: row.id, title: row.title, summary: row.summary ?? '' }),
    onOpenInWriting: (row) => {
      navigate(`/books/${bookId}/writing`, { state: { outlineNodeId: row.id } });
    },
    onReorder: (id, dir) => {
      const target = flat.find((r) => r.id === id);
      if (!target) return;
      const sibs = siblingsOf(flat, target.parentId);
      const idx = sibs.findIndex((s) => s.id === id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= sibs.length) return;
      const ordered = [...sibs];
      [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
      reorderMutation.mutate(ordered.map((s) => s.id));
    },
    onReparent: (draggedId, parentId) => {
      const target = flat.find((r) => r.id === draggedId);
      if (!target) return;
      // 不能拖到自己 / 自己的后代上
      const isDescendant = (rootId: string, candidateId: string): boolean => {
        if (rootId === candidateId) return true;
        const childs = flat.filter((r) => r.parentId === rootId);
        return childs.some((c) => isDescendant(c.id, candidateId));
      };
      if (parentId && isDescendant(draggedId, parentId)) return;
      const sibs = siblingsOf(flat, parentId);
      moveMutation.mutate({
        id: draggedId,
        parentId,
        order: sibs.filter((s) => s.id !== draggedId).length,
      });
    },
    busyId,
  };

  const canCreateRoot = roots.length === 0 || true; // 总能加新 arc

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-pixel text-pixel-lg">大纲</h1>
        <span className="font-ui text-sm text-ink-soft">总纲、卷、章、场景</span>
        <div className="ml-auto flex gap-2">
          <PixelButton variant="ghost" onClick={() => setAiOpen(true)}>
            AI 生成大纲
          </PixelButton>
          {canCreateRoot && (
            <PixelButton
              onClick={() => setAddDraft({ parentId: null, type: 'arc', title: '', summary: '' })}
            >
              + 新建总纲
            </PixelButton>
          )}
        </div>
      </header>

      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
        {treeQuery.isLoading && <div className="font-ui text-sm text-ink-soft p-4">加载中…</div>}
        {treeQuery.isError && (
          <div className="font-ui text-sm text-danger p-4">加载失败，请稍后重试。</div>
        )}
        {treeQuery.isSuccess && roots.length === 0 && (
          <div className="font-ui text-sm text-ink-soft p-4 text-center">
            当前作品还没有大纲。
            <br />
            点击右上「+ 新建总纲」开始。
          </div>
        )}
        {roots.length > 0 && (
          <div className="space-y-3">
            <RootDropZone onReparent={actions.onReparent} />
            {roots.map((node) => (
              <OutlineCard key={node.node.id} node={node} depth={0} actions={actions} />
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 font-ui text-xs text-ink-mute">
        拖一张卡片到另一张 → 成为它的最后一个子（层级改变）。 拖到顶部虚线区 → 提升为根。↑↓
        用于同级排序。
      </p>

      <PixelDialog
        open={addDraft !== null}
        onClose={() => setAddDraft(null)}
        title={addDraft ? `新建${TYPE_LABEL[addDraft.type]}` : ''}
        footer={
          <>
            <PixelButton variant="ghost" onClick={() => setAddDraft(null)}>
              取消
            </PixelButton>
            <PixelButton
              disabled={!addDraft?.title.trim() || createNode.isPending}
              onClick={() => addDraft && createNode.mutate(addDraft)}
            >
              {createNode.isPending ? '创建中…' : '创建'}
            </PixelButton>
          </>
        }
      >
        {addDraft && (
          <div className="space-y-3">
            <label className="block" htmlFor="outline-add-title">
              <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">标题 *</span>
              <PixelInput
                id="outline-add-title"
                autoFocus
                value={addDraft.title}
                onChange={(e) => setAddDraft({ ...addDraft, title: e.target.value })}
              />
            </label>
            <label className="block" htmlFor="outline-add-summary">
              <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">简介</span>
              <PixelTextArea
                id="outline-add-summary"
                rows={3}
                value={addDraft.summary}
                onChange={(e) => setAddDraft({ ...addDraft, summary: e.target.value })}
              />
            </label>
          </div>
        )}
      </PixelDialog>

      <AiGenerateDialog
        open={aiOpen}
        bookId={bookId}
        existingRootCount={roots.length}
        onClose={() => setAiOpen(false)}
        onWritten={invalidate}
      />

      <PixelDialog
        open={renameDraft !== null}
        onClose={() => setRenameDraft(null)}
        title="重命名"
        footer={
          <>
            <PixelButton variant="ghost" onClick={() => setRenameDraft(null)}>
              取消
            </PixelButton>
            <PixelButton
              disabled={!renameDraft?.title.trim() || renameMutation.isPending}
              onClick={() => renameDraft && renameMutation.mutate(renameDraft)}
            >
              {renameMutation.isPending ? '保存中…' : '保存'}
            </PixelButton>
          </>
        }
      >
        {renameDraft && (
          <div className="space-y-3">
            <label className="block" htmlFor="outline-rename-title">
              <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">标题</span>
              <PixelInput
                id="outline-rename-title"
                autoFocus
                value={renameDraft.title}
                onChange={(e) => setRenameDraft({ ...renameDraft, title: e.target.value })}
              />
            </label>
            <label className="block" htmlFor="outline-rename-summary">
              <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">简介</span>
              <PixelTextArea
                id="outline-rename-summary"
                rows={3}
                value={renameDraft.summary}
                onChange={(e) => setRenameDraft({ ...renameDraft, summary: e.target.value })}
              />
            </label>
          </div>
        )}
      </PixelDialog>
    </div>
  );
}
