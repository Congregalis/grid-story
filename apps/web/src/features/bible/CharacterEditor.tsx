import { useEffect, useState } from 'react';
import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { Character } from '@grid-story/schema';
import { arrayToCsv, csvToArray, emptyCharacter, type CharacterRow } from './types';

export interface CharacterEditorProps {
  bookId: string;
  draft: CharacterRow | null;
  /** 整个 book 的角色列表，用来把 relationships 里的 targetId 转回名字 */
  allCharacters: CharacterRow[];
  onSave: (next: CharacterRow | (Omit<Character, 'id' | 'createdAt' | 'updatedAt'> & { id?: undefined })) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
  deleting?: boolean;
}

type FormState = ReturnType<typeof emptyCharacter> & { id?: string };

function fromCharacter(c: CharacterRow | null, bookId: string): FormState {
  if (!c) return emptyCharacter(bookId);
  // 只取需要编辑的字段（避免把 createdAt 等带回 PUT body）
  const { id, createdAt: _ca, updatedAt: _ua, ...rest } = c;
  void _ca;
  void _ua;
  return { ...rest, id };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-pixel text-pixel-sm mb-1 text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function CharacterEditor({
  bookId,
  draft,
  allCharacters,
  onSave,
  onDelete,
  saving,
  deleting,
}: CharacterEditorProps) {
  const [form, setForm] = useState<FormState>(() => fromCharacter(draft, bookId));
  const [aliasesText, setAliasesText] = useState(arrayToCsv(form.aliases));
  const [abilitiesText, setAbilitiesText] = useState(arrayToCsv(form.abilities));

  useEffect(() => {
    const f = fromCharacter(draft, bookId);
    setForm(f);
    setAliasesText(arrayToCsv(f.aliases));
    setAbilitiesText(arrayToCsv(f.abilities));
  }, [draft, bookId]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    const payload = {
      ...form,
      aliases: csvToArray(aliasesText),
      abilities: csvToArray(abilitiesText),
    };
    if (!payload.name.trim()) return;
    onSave(payload as CharacterRow);
  };

  const isNew = !form.id;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-pixel text-pixel-md">
          {isNew ? '新建角色' : `编辑角色 · ${draft?.name ?? ''}`}
        </h2>
        <div className="flex gap-2">
          {!isNew && (
            <PixelButton
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={() => {
                if (form.id && confirm(`删除角色「${form.name}」？此操作不可撤销。`)) {
                  onDelete(form.id);
                }
              }}
            >
              {deleting ? '删除中…' : '删除'}
            </PixelButton>
          )}
          <PixelButton size="sm" disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? '保存中…' : isNew ? '创建' : '保存'}
          </PixelButton>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Field label="姓名 *">
          <PixelInput
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="林听雪"
          />
        </Field>
        <Field label="别名 / 称谓（逗号分隔）">
          <PixelInput
            value={aliasesText}
            onChange={(e) => setAliasesText(e.target.value)}
            placeholder="听雪, 雪夫人"
          />
        </Field>
        <Field label="性别">
          <select
            className="block w-full bg-surface-raised text-ink font-ui border-2 border-outline rounded-sm h-8 px-2"
            value={form.gender ?? ''}
            onChange={(e) =>
              update(
                'gender',
                (e.target.value === '' ? null : e.target.value) as FormState['gender'],
              )
            }
          >
            <option value="">—</option>
            <option value="male">male</option>
            <option value="female">female</option>
            <option value="other">other</option>
          </select>
        </Field>
        <Field label="年龄">
          <PixelInput
            value={form.age ?? ''}
            onChange={(e) => update('age', e.target.value || null)}
            placeholder="二十出头"
          />
        </Field>
        <Field label="种族 / 族群">
          <PixelInput
            value={form.species ?? ''}
            onChange={(e) => update('species', e.target.value || null)}
            placeholder="人类"
          />
        </Field>
        <Field label="所在地点 ID">
          <PixelInput
            value={form.locationId ?? ''}
            onChange={(e) => update('locationId', e.target.value || null)}
            placeholder="留空"
          />
        </Field>
      </div>

      <Field label="外貌">
        <PixelTextArea
          rows={2}
          value={form.appearance ?? ''}
          onChange={(e) => update('appearance', e.target.value || null)}
        />
      </Field>
      <Field label="性格">
        <PixelTextArea
          rows={2}
          value={form.personality ?? ''}
          onChange={(e) => update('personality', e.target.value || null)}
        />
      </Field>
      <Field label="背景">
        <PixelTextArea
          rows={3}
          value={form.background ?? ''}
          onChange={(e) => update('background', e.target.value || null)}
        />
      </Field>
      <Field label="动机">
        <PixelTextArea
          rows={2}
          value={form.motivation ?? ''}
          onChange={(e) => update('motivation', e.target.value || null)}
        />
      </Field>
      <Field label="能力 / 技能（逗号分隔）">
        <PixelInput
          value={abilitiesText}
          onChange={(e) => setAbilitiesText(e.target.value)}
          placeholder="剑术, 望气"
        />
      </Field>
      <Field label="备注 / 自由字段">
        <PixelTextArea
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value || null)}
        />
      </Field>

      {form.relationships.length > 0 && (
        <div>
          <span className="block font-pixel text-pixel-sm mb-2 text-ink-soft">
            关系（只读 · 编辑见关系图视图）
          </span>
          <ul className="bg-surface-raised border-2 border-outline-soft rounded-sm divide-y-2 divide-outline-soft">
            {form.relationships.map((r, i) => {
              const target = allCharacters.find((c) => c.id === r.targetId);
              return (
                <li key={i} className="px-3 py-2 font-ui text-sm">
                  <span className="font-pixel text-pixel-sm bg-secondary-soft text-secondary px-1.5 py-0.5 mr-2">
                    {r.type}
                  </span>
                  → {target?.name ?? r.targetId}
                  <span className="text-ink-soft ml-2">{r.description}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
