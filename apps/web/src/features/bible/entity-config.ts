import type {
  BibleEntityType,
  Character,
  Concept,
  Item,
  Location,
  Organization,
  TimelineEvent,
} from '@grid-story/schema';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'csv'
  | 'entity-ref'
  | 'entity-ref-multi'
  | 'number';

export type BibleEntityRow =
  | Character
  | Location
  | Organization
  | Item
  | TimelineEvent
  | Concept;

export type EntityFormValues = Record<string, unknown> & {
  bookId: string;
  id?: string;
};

export interface SelectOption {
  value: string;
  label: string;
}

export interface EntityField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  span?: 'half' | 'full';
  rows?: number;
  options?: SelectOption[];
  targetType?: BibleEntityType;
}

export interface EntityConfig {
  type: BibleEntityType;
  path: string;
  label: string;
  pluralLabel: string;
  titleField: string;
  subtitleFields: string[];
  tagClassName: string;
  emptyValues: (bookId: string) => EntityFormValues;
  fields: EntityField[];
  listTrailing: (row: BibleEntityRow) => string;
}

const base = (bookId: string) => ({ bookId, notes: null });

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export const entityConfigs = {
  character: {
    type: 'character',
    path: 'characters',
    label: '角色',
    pluralLabel: '角色',
    titleField: 'name',
    subtitleFields: ['motivation', 'personality', 'background'],
    tagClassName: 'bg-secondary',
    emptyValues: (bookId) => ({
      ...base(bookId),
      name: '',
      aliases: [],
      gender: null,
      age: null,
      species: null,
      appearance: null,
      personality: null,
      background: null,
      motivation: null,
      abilities: [],
      relationships: [],
      locationId: null,
      organizationIds: [],
    }),
    fields: [
      { key: 'name', label: '姓名 *', type: 'text', required: true, placeholder: '林听雪' },
      { key: 'aliases', label: '别名 / 称谓', type: 'csv', placeholder: '听雪, 雪夫人' },
      {
        key: 'gender',
        label: '性别',
        type: 'select',
        options: [
          { value: 'male', label: 'male' },
          { value: 'female', label: 'female' },
          { value: 'other', label: 'other' },
        ],
      },
      { key: 'age', label: '年龄', type: 'text', placeholder: '二十出头' },
      { key: 'species', label: '种族 / 族群', type: 'text', placeholder: '人类' },
      { key: 'locationId', label: '所在地点', type: 'entity-ref', targetType: 'location' },
      { key: 'organizationIds', label: '所属组织', type: 'entity-ref-multi', targetType: 'organization', span: 'full' },
      { key: 'appearance', label: '外貌', type: 'textarea', rows: 2, span: 'full' },
      { key: 'personality', label: '性格', type: 'textarea', rows: 2, span: 'full' },
      { key: 'background', label: '背景', type: 'textarea', rows: 3, span: 'full' },
      { key: 'motivation', label: '动机', type: 'textarea', rows: 2, span: 'full' },
      { key: 'abilities', label: '能力 / 技能', type: 'csv', placeholder: '剑术, 望气', span: 'full' },
      { key: 'notes', label: '备注 / 自由字段', type: 'textarea', rows: 2, span: 'full' },
    ],
    listTrailing: (row) => {
      const relationships = arrayValue((row as Character).relationships);
      return relationships.length > 0 ? `${relationships.length} 关系` : '';
    },
  },
  location: {
    type: 'location',
    path: 'locations',
    label: '地点',
    pluralLabel: '地点',
    titleField: 'name',
    subtitleFields: ['description', 'atmosphere', 'significance'],
    tagClassName: 'bg-success',
    emptyValues: (bookId) => ({
      ...base(bookId),
      name: '',
      type: '',
      parentId: null,
      description: null,
      atmosphere: null,
      significance: null,
    }),
    fields: [
      { key: 'name', label: '名称 *', type: 'text', required: true, placeholder: '雪夜城' },
      { key: 'type', label: '类型 *', type: 'text', required: true, placeholder: '城市 / 遗迹 / 学院' },
      { key: 'parentId', label: '上级地点', type: 'entity-ref', targetType: 'location' },
      { key: 'description', label: '描述 / 历史', type: 'textarea', rows: 3, span: 'full' },
      { key: 'atmosphere', label: '氛围', type: 'textarea', rows: 2, span: 'full' },
      { key: 'significance', label: '重要性', type: 'textarea', rows: 2, span: 'full' },
      { key: 'notes', label: '备注 / 自由字段', type: 'textarea', rows: 2, span: 'full' },
    ],
    listTrailing: (row) => stringValue((row as Location).type),
  },
  organization: {
    type: 'organization',
    path: 'organizations',
    label: '组织',
    pluralLabel: '组织',
    titleField: 'name',
    subtitleFields: ['goals', 'structure', 'description'],
    tagClassName: 'bg-primary',
    emptyValues: (bookId) => ({
      ...base(bookId),
      name: '',
      type: '',
      description: null,
      leaderId: null,
      memberIds: [],
      goals: null,
      structure: null,
      locationId: null,
    }),
    fields: [
      { key: 'name', label: '名称 *', type: 'text', required: true, placeholder: '北境巡夜司' },
      { key: 'type', label: '类型 *', type: 'text', required: true, placeholder: '官署 / 帮派 / 学派' },
      { key: 'leaderId', label: '领袖', type: 'entity-ref', targetType: 'character' },
      { key: 'locationId', label: '驻地', type: 'entity-ref', targetType: 'location' },
      { key: 'memberIds', label: '成员', type: 'entity-ref-multi', targetType: 'character', span: 'full' },
      { key: 'description', label: '描述', type: 'textarea', rows: 3, span: 'full' },
      { key: 'goals', label: '目标', type: 'textarea', rows: 2, span: 'full' },
      { key: 'structure', label: '权力结构', type: 'textarea', rows: 2, span: 'full' },
      { key: 'notes', label: '备注 / 自由字段', type: 'textarea', rows: 2, span: 'full' },
    ],
    listTrailing: (row) => {
      const members = arrayValue((row as Organization).memberIds);
      return members.length > 0 ? `${members.length} 成员` : stringValue((row as Organization).type);
    },
  },
  item: {
    type: 'item',
    path: 'items',
    label: '物品',
    pluralLabel: '物品',
    titleField: 'name',
    subtitleFields: ['significance', 'origin', 'description'],
    tagClassName: 'bg-warning',
    emptyValues: (bookId) => ({
      ...base(bookId),
      name: '',
      type: '',
      description: null,
      ownerId: null,
      origin: null,
      abilities: [],
      significance: null,
    }),
    fields: [
      { key: 'name', label: '名称 *', type: 'text', required: true, placeholder: '照骨灯' },
      { key: 'type', label: '类型 *', type: 'text', required: true, placeholder: '法器 / 信物 / 武器' },
      { key: 'ownerId', label: '持有者', type: 'entity-ref', targetType: 'character' },
      { key: 'origin', label: '来源', type: 'textarea', rows: 2, span: 'full' },
      { key: 'abilities', label: '能力', type: 'csv', placeholder: '照见谎言, 引出旧伤', span: 'full' },
      { key: 'description', label: '描述', type: 'textarea', rows: 3, span: 'full' },
      { key: 'significance', label: '重要性 / 隐喻', type: 'textarea', rows: 2, span: 'full' },
      { key: 'notes', label: '备注 / 自由字段', type: 'textarea', rows: 2, span: 'full' },
    ],
    listTrailing: (row) => {
      const abilities = arrayValue((row as Item).abilities);
      return abilities.length > 0 ? `${abilities.length} 能力` : stringValue((row as Item).type);
    },
  },
  timelineEvent: {
    type: 'timelineEvent',
    path: 'timeline-events',
    label: '时间线事件',
    pluralLabel: '时间线',
    titleField: 'title',
    subtitleFields: ['description', 'timestamp'],
    tagClassName: 'bg-ink-soft',
    emptyValues: (bookId) => ({
      ...base(bookId),
      title: '',
      description: null,
      timestamp: null,
      order: 0,
      relatedCharacterIds: [],
      relatedLocationIds: [],
      causeEventIds: [],
      effectEventIds: [],
    }),
    fields: [
      { key: 'title', label: '事件标题 *', type: 'text', required: true, placeholder: '雪夜城第一次封门' },
      { key: 'timestamp', label: '时间点', type: 'text', placeholder: '第3章 / 十年前 / 远古时代' },
      { key: 'order', label: '排序', type: 'number', required: true },
      { key: 'relatedCharacterIds', label: '关联角色', type: 'entity-ref-multi', targetType: 'character', span: 'full' },
      { key: 'relatedLocationIds', label: '关联地点', type: 'entity-ref-multi', targetType: 'location', span: 'full' },
      { key: 'causeEventIds', label: '前因事件', type: 'entity-ref-multi', targetType: 'timelineEvent', span: 'full' },
      { key: 'effectEventIds', label: '后果事件', type: 'entity-ref-multi', targetType: 'timelineEvent', span: 'full' },
      { key: 'description', label: '描述 / 因果', type: 'textarea', rows: 3, span: 'full' },
      { key: 'notes', label: '备注 / 自由字段', type: 'textarea', rows: 2, span: 'full' },
    ],
    listTrailing: (row) => {
      const event = row as TimelineEvent;
      return event.timestamp ? event.timestamp : `#${event.order}`;
    },
  },
  concept: {
    type: 'concept',
    path: 'concepts',
    label: '概念',
    pluralLabel: '概念',
    titleField: 'name',
    subtitleFields: ['description', 'rules', 'examples'],
    tagClassName: 'bg-outline-soft',
    emptyValues: (bookId) => ({
      ...base(bookId),
      name: '',
      category: '',
      description: null,
      rules: null,
      examples: null,
    }),
    fields: [
      { key: 'name', label: '名称 *', type: 'text', required: true, placeholder: '望气术' },
      { key: 'category', label: '分类 *', type: 'text', required: true, placeholder: '魔法体系 / 社会制度' },
      { key: 'description', label: '描述', type: 'textarea', rows: 3, span: 'full' },
      { key: 'rules', label: '规则 / 边界', type: 'textarea', rows: 3, span: 'full' },
      { key: 'examples', label: '例子', type: 'textarea', rows: 2, span: 'full' },
      { key: 'notes', label: '备注 / 自由字段', type: 'textarea', rows: 2, span: 'full' },
    ],
    listTrailing: (row) => stringValue((row as Concept).category),
  },
} satisfies Record<BibleEntityType, EntityConfig>;

export const entityConfigList = [
  entityConfigs.character,
  entityConfigs.location,
  entityConfigs.organization,
  entityConfigs.item,
  entityConfigs.timelineEvent,
  entityConfigs.concept,
];

export function isBibleEntityType(value: string | null): value is BibleEntityType {
  return value != null && value in entityConfigs;
}

export function getEntityTitle(config: EntityConfig, row: BibleEntityRow | EntityFormValues): string {
  const values = row as Record<string, unknown>;
  const title = stringValue(values[config.titleField]);
  return title || '（未命名）';
}

export function getEntitySubtitle(config: EntityConfig, row: BibleEntityRow): string {
  const values = row as Record<string, unknown>;
  for (const key of config.subtitleFields) {
    const value = stringValue(values[key]);
    if (value) return value;
  }
  return '';
}

export function toEditableValues(
  config: EntityConfig,
  draft: BibleEntityRow | null,
  bookId: string,
): EntityFormValues {
  if (!draft) return config.emptyValues(bookId);
  const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = draft;
  void _createdAt;
  void _updatedAt;
  return { ...config.emptyValues(bookId), ...rest, id };
}

export function csvToArray(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function arrayToCsv(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').join(', ')
    : '';
}
