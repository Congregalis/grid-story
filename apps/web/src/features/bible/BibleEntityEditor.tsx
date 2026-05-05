import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { CharacterRelationship } from '@grid-story/schema';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { AiGenerateEntityDialog } from './AiGenerateEntityDialog';
import { EntityRefMultiPicker, EntityRefPicker } from './EntityRefPicker';
import { type FieldAiAction, FieldAiPopover } from './FieldAiPopover';
import { RelationshipListField } from './RelationshipListField';
import {
  type BibleEntityRow,
  type EntityConfig,
  type EntityField,
  type EntityFormValues,
  arrayToCsv,
  csvToArray,
  getEntityTitle,
  toEditableValues,
} from './entity-config';

export interface BibleEntityEditorProps {
  bookId: string;
  config: EntityConfig;
  draft: BibleEntityRow | null;
  onSave: (next: EntityFormValues) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
  deleting?: boolean;
}

function FieldShell({
  field,
  action,
  children,
}: {
  field: EntityField;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={field.span === 'full' ? 'block lg:col-span-2' : 'block'}>
      <div className="mb-1 flex min-h-7 items-center justify-between gap-2">
        <span className="block font-pixel text-pixel-sm text-ink-soft">{field.label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: string): string | null {
  return value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function relationshipArray(value: unknown): CharacterRelationship[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is CharacterRelationship =>
          typeof item === 'object' &&
          item != null &&
          typeof (item as CharacterRelationship).targetId === 'string' &&
          typeof (item as CharacterRelationship).type === 'string' &&
          typeof (item as CharacterRelationship).description === 'string',
      )
    : [];
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return value != null;
}

interface RefineFieldResponse {
  ok: boolean;
  value: string | string[];
}

const FIELD_AI_TYPES = new Set<EntityField['type']>(['text', 'textarea', 'csv']);

const FIELD_ACTION_LABELS = {
  generate: '生成',
  expand: '扩写',
  shrink: '缩写',
  polish: '润色',
  rephrase: '换语气',
  custom: '修改',
} satisfies Record<FieldAiAction, string>;

function supportsFieldAi(field: EntityField): boolean {
  return FIELD_AI_TYPES.has(field.type);
}

function wikiPathFor(config: EntityConfig, entityId: string): string {
  // The backend's resolveLink finds pages by bible_entity_id. Pass the id and let
  // the wiki route fall through to that lookup.
  void config;
  return entityId;
}

function cleanFieldLabel(label: string): string {
  return label.replace('*', '').trim();
}

export function BibleEntityEditor({
  bookId,
  config,
  draft,
  onSave,
  onDelete,
  saving,
  deleting,
}: BibleEntityEditorProps) {
  const [form, setForm] = useState<EntityFormValues>(() => toEditableValues(config, draft, bookId));
  const [csvText, setCsvText] = useState<Record<string, string>>({});
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [openAiField, setOpenAiField] = useState<string | null>(null);
  const [loadingField, setLoadingField] = useState<string | null>(null);
  const [highlightField, setHighlightField] = useState<string | null>(null);

  const csvFields = useMemo(() => config.fields.filter((field) => field.type === 'csv'), [config]);

  useEffect(() => {
    const next = toEditableValues(config, draft, bookId);
    setForm(next);
    setCsvText(
      Object.fromEntries(csvFields.map((field) => [field.key, arrayToCsv(next[field.key])])),
    );
  }, [bookId, config, csvFields, draft]);

  const update = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const currentValues = (): EntityFormValues => {
    const payload: EntityFormValues = { ...form, bookId };
    for (const field of csvFields) {
      payload[field.key] = csvToArray(csvText[field.key] ?? '');
    }
    return payload;
  };

  const currentFieldValue = (field: EntityField): unknown => {
    if (field.type === 'csv') return csvToArray(csvText[field.key] ?? '');
    return form[field.key];
  };

  const flashField = (key: string) => {
    setHighlightField(key);
    window.setTimeout(() => {
      setHighlightField((current) => (current === key ? null : current));
    }, 900);
  };

  const applyFieldValue = (field: EntityField, value: unknown) => {
    if (field.type === 'csv') {
      const next = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : csvToArray(typeof value === 'string' ? value : '');
      update(field.key, next);
      setCsvText((prev) => ({ ...prev, [field.key]: arrayToCsv(next) }));
      flashField(field.key);
      return;
    }

    const text = typeof value === 'string' ? value : Array.isArray(value) ? arrayToCsv(value) : '';
    update(field.key, field.required ? text : nullableText(text));
    flashField(field.key);
  };

  const acceptGeneratedEntity = (entity: EntityFormValues) => {
    const next: EntityFormValues = {
      ...form,
      ...entity,
      bookId,
      id: form.id,
    };
    setForm(next);
    setCsvText(
      Object.fromEntries(csvFields.map((field) => [field.key, arrayToCsv(next[field.key])])),
    );
  };

  const requestFieldAi = async (
    field: EntityField,
    request: { action: FieldAiAction; hint?: string },
  ): Promise<unknown> => {
    setLoadingField(field.key);
    try {
      const response = await api.post<RefineFieldResponse>('/agent/bible/refine-field', {
        bookId,
        entityType: config.type,
        current: currentValues(),
        targetField: field.key,
        action: request.action,
        hint: request.hint,
      });
      toast.success(`已 ${FIELD_ACTION_LABELS[request.action]} ${cleanFieldLabel(field.label)}`);
      return response.value;
    } catch (error) {
      const msg = formatApiError(error, 'AI 字段处理失败，请稍后重试');
      toast.error(msg);
      throw new Error(msg);
    } finally {
      setLoadingField((current) => (current === field.key ? null : current));
    }
  };

  const handleFieldAiClick = async (field: EntityField) => {
    if (loadingField) return;
    if (!isFilled(currentFieldValue(field))) {
      setOpenAiField(null);
      try {
        const value = await requestFieldAi(field, { action: 'generate' });
        applyFieldValue(field, value);
      } catch {
        // requestFieldAi 已经 toast，这里只负责阻止未处理 promise。
      }
      return;
    }

    setOpenAiField((current) => (current === field.key ? null : field.key));
  };

  const isNew = !form.id;
  const title = getEntityTitle(config, form);
  const requiredFieldsFilled = config.fields.every(
    (field) => !field.required || isFilled(form[field.key]),
  );
  const canSave = !saving && requiredFieldsFilled;

  const handleSave = () => {
    if (!canSave) return;
    onSave(currentValues());
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-pixel text-pixel-md">
            {isNew ? `新建${config.label}` : `编辑${config.label} · ${title}`}
          </h2>
        </div>
        <div className="flex gap-2">
          <PixelButton
            variant="ghost"
            size="sm"
            disabled={saving || deleting}
            onClick={() => setAiDialogOpen(true)}
          >
            ✨ AI 生成完整{config.label}
          </PixelButton>
          {!isNew && form.id && (
            <Link
              to={`/books/${bookId}/wiki?p=${encodeURIComponent(wikiPathFor(config, form.id))}`}
              className="inline-flex h-7 items-center px-3 font-pixel text-pixel-sm border-2 border-outline rounded-sm bg-surface text-ink hover:bg-surface-raised shadow-pixel-1 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              title="在 Wiki 中查看"
            >
              📖 Wiki
            </Link>
          )}
          {!isNew && (
            <PixelButton
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={() => {
                if (form.id && confirm(`删除${config.label}「${title}」？此操作不可撤销。`)) {
                  onDelete(form.id);
                }
              }}
            >
              {deleting ? '删除中...' : '删除'}
            </PixelButton>
          )}
          <PixelButton size="sm" disabled={!canSave} onClick={handleSave}>
            {saving ? '保存中...' : isNew ? '创建' : '保存'}
          </PixelButton>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {config.fields.map((field) => {
          const fieldAiEnabled = supportsFieldAi(field);
          const fieldLoading = loadingField === field.key;
          return (
            <FieldShell
              key={field.key}
              field={field}
              action={
                fieldAiEnabled ? (
                  <div className="relative">
                    <PixelButton
                      variant="ghost"
                      size="sm"
                      className="h-6 w-7 px-0"
                      title={`AI 优化${cleanFieldLabel(field.label)}`}
                      disabled={saving || deleting || Boolean(loadingField)}
                      onClick={() => void handleFieldAiClick(field)}
                    >
                      ✨
                    </PixelButton>
                    {openAiField === field.key && (
                      <FieldAiPopover
                        field={field}
                        value={currentFieldValue(field)}
                        onRun={(request) => requestFieldAi(field, request)}
                        onAccept={(value) => applyFieldValue(field, value)}
                        onClose={() => setOpenAiField(null)}
                      />
                    )}
                  </div>
                ) : null
              }
            >
              <div
                className={`relative transition-[outline-color] ${
                  highlightField === field.key
                    ? 'outline outline-1 outline-primary'
                    : 'outline outline-0 outline-transparent'
                }`}
              >
                <FieldInput
                  bookId={bookId}
                  selfId={typeof form.id === 'string' ? form.id : null}
                  field={field}
                  value={form[field.key]}
                  csvValue={csvText[field.key] ?? ''}
                  disabled={saving || deleting || fieldLoading}
                  onChange={(value) => update(field.key, value)}
                  onCsvChange={(value) => setCsvText((prev) => ({ ...prev, [field.key]: value }))}
                />
                {fieldLoading && (
                  <div className="absolute inset-0 flex items-center justify-center border-2 border-primary bg-surface/80">
                    <span className="font-pixel text-pixel-md text-primary animate-pulse">◆</span>
                  </div>
                )}
              </div>
            </FieldShell>
          );
        })}
      </div>

      <footer className="flex justify-end border-t-2 border-outline-soft pt-4">
        <PixelButton size="sm" disabled={!canSave} onClick={handleSave}>
          {saving ? '保存中...' : isNew ? '创建' : '保存'}
        </PixelButton>
      </footer>

      <AiGenerateEntityDialog
        open={aiDialogOpen}
        bookId={bookId}
        config={config}
        current={currentValues()}
        startFromCurrent={!isNew}
        onClose={() => setAiDialogOpen(false)}
        onAccept={acceptGeneratedEntity}
      />
    </div>
  );
}

function FieldInput({
  bookId,
  selfId,
  field,
  value,
  csvValue,
  disabled,
  onChange,
  onCsvChange,
}: {
  bookId: string;
  selfId?: string | null;
  field: EntityField;
  value: unknown;
  csvValue: string;
  disabled?: boolean;
  onChange: (value: unknown) => void;
  onCsvChange: (value: string) => void;
}) {
  if (field.type === 'textarea') {
    return (
      <PixelTextArea
        rows={field.rows ?? 3}
        value={stringOrEmpty(value)}
        onChange={(event) => onChange(nullableText(event.target.value))}
        disabled={disabled}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        className="block h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink focus:border-primary focus:outline-none focus:shadow-pixel-1-primary disabled:cursor-not-allowed disabled:opacity-50"
        value={stringOrEmpty(value)}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled}
      >
        <option value="">-</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'csv') {
    return (
      <PixelInput
        value={csvValue}
        onChange={(event) => onCsvChange(event.target.value)}
        disabled={disabled}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === 'entity-ref') {
    return (
      <EntityRefPicker
        bookId={bookId}
        targetType={field.targetType ?? 'character'}
        value={typeof value === 'string' ? value : null}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (field.type === 'entity-ref-multi') {
    return (
      <EntityRefMultiPicker
        bookId={bookId}
        targetType={field.targetType ?? 'character'}
        value={stringArray(value)}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (field.type === 'relationship-list') {
    return (
      <RelationshipListField
        bookId={bookId}
        selfId={selfId}
        value={relationshipArray(value)}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (field.type === 'number') {
    const numValue = typeof value === 'number' ? value : 0;
    return (
      <PixelInput
        type="number"
        value={numValue}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 0)}
        disabled={disabled}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-primary"
        />
        <span className="font-pixel text-pixel-sm text-ink-soft">
          {value === true ? '是' : '否'}
        </span>
      </label>
    );
  }

  return (
    <PixelInput
      value={stringOrEmpty(value)}
      onChange={(event) =>
        onChange(field.required ? event.target.value : nullableText(event.target.value))
      }
      disabled={disabled}
      placeholder={field.placeholder}
    />
  );
}
