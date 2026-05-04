import { PixelButton, PixelDialog, PixelList, PixelListItem } from '@grid-story/pixel-kit';
import type { BibleEntityType } from '@grid-story/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  type BibleEntityRow,
  entityConfigs,
  getEntitySubtitle,
  getEntityTitle,
} from './entity-config';

interface EntityRefPickerProps {
  bookId: string;
  targetType: BibleEntityType;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  excludeIds?: string[];
}

interface EntityRefMultiPickerProps {
  bookId: string;
  targetType: BibleEntityType;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

function useReferenceRows(bookId: string, targetType: BibleEntityType) {
  const config = entityConfigs[targetType];
  return useQuery({
    queryKey: ['bible-ref', config.path, bookId],
    queryFn: () =>
      api.get<BibleEntityRow[]>(`/bible/${config.path}?bookId=${encodeURIComponent(bookId)}`),
  });
}

function selectedLabel(
  id: string,
  rows: BibleEntityRow[] | undefined,
  targetType: BibleEntityType,
): string {
  const config = entityConfigs[targetType];
  const row = rows?.find((item) => item.id === id);
  return row ? getEntityTitle(config, row) : id;
}

export function EntityRefPicker({
  bookId,
  targetType,
  value,
  onChange,
  disabled,
  excludeIds,
}: EntityRefPickerProps) {
  const [open, setOpen] = useState(false);
  const config = entityConfigs[targetType];
  const query = useReferenceRows(bookId, targetType);
  const rows = query.data ?? [];
  const visibleRows = useMemo(
    () => (excludeIds?.length ? rows.filter((row) => !excludeIds.includes(row.id)) : rows),
    [excludeIds, rows],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="inline-flex max-w-full items-center gap-2 border-2 border-outline-soft bg-surface-raised px-2 py-1 font-ui text-sm">
            <span className="truncate">{selectedLabel(value, query.data, targetType)}</span>
            <button
              type="button"
              className="font-pixel text-pixel-sm text-danger"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              清除
            </button>
          </span>
        ) : (
          <span className="font-ui text-sm text-ink-mute">未选择</span>
        )}
        <PixelButton variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          选择{config.label}
        </PixelButton>
      </div>

      <PixelDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`选择${config.label}`}
        className="max-w-[480px]"
        footer={
          <PixelButton variant="ghost" onClick={() => setOpen(false)}>
            完成
          </PixelButton>
        }
      >
        <ReferenceList
          rows={visibleRows}
          targetType={targetType}
          selectedIds={value ? [value] : []}
          loading={query.isLoading}
          error={query.isError ? '暂时无法连接，请稍后重试。' : null}
          onToggle={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </PixelDialog>
    </div>
  );
}

export function EntityRefMultiPicker({
  bookId,
  targetType,
  value,
  onChange,
  disabled,
}: EntityRefMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const config = entityConfigs[targetType];
  const query = useReferenceRows(bookId, targetType);
  const selected = useMemo(() => new Set(value), [value]);
  const rows = query.data ?? [];

  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-2 border-2 border-outline-soft bg-surface-raised px-2 py-1 font-ui text-sm"
            >
              <span className="truncate">{selectedLabel(id, query.data, targetType)}</span>
              <button
                type="button"
                className="font-pixel text-pixel-sm text-danger"
                disabled={disabled}
                onClick={() => onChange(value.filter((item) => item !== id))}
              >
                移除
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="font-ui text-sm text-ink-mute">未选择</span>
      )}

      <PixelButton variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        添加{config.label}
      </PixelButton>

      <PixelDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`选择${config.label}`}
        className="max-w-[520px]"
        footer={
          <PixelButton variant="ghost" onClick={() => setOpen(false)}>
            完成
          </PixelButton>
        }
      >
        <ReferenceList
          rows={rows}
          targetType={targetType}
          selectedIds={value}
          loading={query.isLoading}
          error={query.isError ? '暂时无法连接，请稍后重试。' : null}
          onToggle={toggle}
        />
      </PixelDialog>
    </div>
  );
}

function ReferenceList({
  rows,
  targetType,
  selectedIds,
  loading,
  error,
  onToggle,
}: {
  rows: BibleEntityRow[];
  targetType: BibleEntityType;
  selectedIds: string[];
  loading: boolean;
  error: string | null;
  onToggle: (id: string) => void;
}) {
  const config = entityConfigs[targetType];

  if (loading) {
    return <p className="font-ui text-sm text-ink-soft">加载中...</p>;
  }

  if (error) {
    return <p className="font-ui text-sm text-danger">加载失败：{error}</p>;
  }

  if (rows.length === 0) {
    return <p className="font-ui text-sm text-ink-soft">当前作品还没有{config.label}。</p>;
  }

  return (
    <PixelList className="max-h-[360px] overflow-auto pixel-scrollbar shadow-none">
      {rows.map((row) => {
        const subtitle = getEntitySubtitle(config, row);
        const active = selectedIds.includes(row.id);
        return (
          <PixelListItem
            key={row.id}
            active={active}
            onClick={() => onToggle(row.id)}
            leading={<span className={`inline-block h-2 w-2 ${config.tagClassName}`} aria-hidden />}
            trailing={<span className="font-pixel text-pixel-sm">{active ? '已选' : ''}</span>}
          >
            <span className="block min-w-0 whitespace-normal">
              <span className="block truncate">{getEntityTitle(config, row)}</span>
              {subtitle && <span className="block truncate text-xs text-ink-soft">{subtitle}</span>}
            </span>
          </PixelListItem>
        );
      })}
    </PixelList>
  );
}
