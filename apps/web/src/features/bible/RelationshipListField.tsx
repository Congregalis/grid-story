import { PixelButton, PixelInput } from '@grid-story/pixel-kit';
import type { CharacterRelationship } from '@grid-story/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntityRefPicker } from './EntityRefPicker';

export interface RelationshipListFieldProps {
  bookId: string;
  selfId?: string | null;
  value: CharacterRelationship[];
  onChange: (next: CharacterRelationship[]) => void;
  disabled?: boolean;
}

const emptyRelationship: CharacterRelationship = {
  targetId: '',
  type: '',
  description: '',
};

export function RelationshipListField({
  bookId,
  selfId,
  value,
  onChange,
  disabled,
}: RelationshipListFieldProps) {
  const nextRowId = useRef(0);
  const createRowId = useCallback(() => `relationship-row-${nextRowId.current++}`, []);
  const [rowIds, setRowIds] = useState<string[]>(() => value.map(() => createRowId()));
  const excludeIds = useMemo(() => (selfId ? [selfId] : []), [selfId]);

  useEffect(() => {
    setRowIds((current) => {
      if (current.length === value.length) return current;
      if (current.length > value.length) return current.slice(0, value.length);
      return [
        ...current,
        ...Array.from({ length: value.length - current.length }, () => createRowId()),
      ];
    });
  }, [createRowId, value.length]);

  const updateAt = (index: number, patch: Partial<CharacterRelationship>) => {
    onChange(value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const removeAt = (index: number) => {
    setRowIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };

  const addRelationship = () => {
    setRowIds((current) => [...current, createRowId()]);
    onChange([...value, { ...emptyRelationship }]);
  };

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <div className="rounded-sm border-2 border-outline-soft bg-surface px-3 py-4 text-center font-ui text-sm text-ink-soft">
          还没有人物关系。
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((relationship, index) => {
            const rowKey = rowIds[index] ?? relationship.targetId;
            return (
              <div
                key={rowKey}
                className="grid grid-cols-1 items-start gap-2 border-2 border-outline-soft bg-surface-raised p-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_auto]"
              >
                <EntityRefPicker
                  bookId={bookId}
                  targetType="character"
                  value={relationship.targetId || null}
                  excludeIds={excludeIds}
                  onChange={(targetId) => updateAt(index, { targetId: targetId ?? '' })}
                  disabled={disabled}
                />
                <PixelInput
                  value={relationship.type}
                  onChange={(event) => updateAt(index, { type: event.target.value })}
                  disabled={disabled}
                  placeholder="师徒 / 宿敌 / 恋人"
                />
                <PixelInput
                  value={relationship.description}
                  onChange={(event) => updateAt(index, { description: event.target.value })}
                  disabled={disabled}
                  placeholder="简述"
                />
                <PixelButton
                  variant="ghost"
                  size="sm"
                  className="w-full lg:w-auto"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                >
                  删除
                </PixelButton>
              </div>
            );
          })}
        </div>
      )}

      <PixelButton variant="ghost" size="sm" disabled={disabled} onClick={addRelationship}>
        + 添加关系
      </PixelButton>
    </div>
  );
}
