import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import {
  arrayToCsv,
  csvToArray,
  getEntityTitle,
  toEditableValues,
  type BibleEntityRow,
  type EntityConfig,
  type EntityField,
  type EntityFormValues,
} from './entity-config';
import { EntityRefMultiPicker, EntityRefPicker } from './EntityRefPicker';

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
  children,
}: {
  field: EntityField;
  children: ReactNode;
}) {
  return (
    <label className={field.span === 'full' ? 'block lg:col-span-2' : 'block'}>
      <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
        {field.label}
      </span>
      {children}
    </label>
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

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return value != null;
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
  const [form, setForm] = useState<EntityFormValues>(() =>
    toEditableValues(config, draft, bookId),
  );
  const [csvText, setCsvText] = useState<Record<string, string>>({});

  const csvFields = useMemo(
    () => config.fields.filter((field) => field.type === 'csv'),
    [config],
  );

  useEffect(() => {
    const next = toEditableValues(config, draft, bookId);
    setForm(next);
    setCsvText(
      Object.fromEntries(
        csvFields.map((field) => [field.key, arrayToCsv(next[field.key])]),
      ),
    );
  }, [bookId, config, csvFields, draft]);

  const update = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isNew = !form.id;
  const title = getEntityTitle(config, form);
  const requiredFieldsFilled = config.fields.every(
    (field) => !field.required || isFilled(form[field.key]),
  );
  const canSave = !saving && requiredFieldsFilled;

  const handleSave = () => {
    if (!canSave) return;
    const payload: EntityFormValues = { ...form, bookId };
    for (const field of csvFields) {
      payload[field.key] = csvToArray(csvText[field.key] ?? '');
    }
    onSave(payload);
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
        {config.fields.map((field) => (
          <FieldShell key={field.key} field={field}>
            <FieldInput
              bookId={bookId}
              field={field}
              value={form[field.key]}
              csvValue={csvText[field.key] ?? ''}
              disabled={saving || deleting}
              onChange={(value) => update(field.key, value)}
              onCsvChange={(value) =>
                setCsvText((prev) => ({ ...prev, [field.key]: value }))
              }
            />
          </FieldShell>
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  bookId,
  field,
  value,
  csvValue,
  disabled,
  onChange,
  onCsvChange,
}: {
  bookId: string;
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
