/**
 * One description of every content type, used to build the admin forms, validate input, call the
 * matching database function and link parents/children. The database re-validates everything.
 */
export type EntityKey =
  'sources' | 'families' | 'exams' | 'stages' | 'papers' | 'syllabus' | 'subjects' | 'topics';

export type FieldType =
  'text' | 'textarea' | 'code' | 'int' | 'decimal' | 'date' | 'url' | 'source' | 'kind';

export interface FieldDef {
  name: string; // column name
  param: string; // RPC parameter name
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  max?: number; // max length (text) or max value (numbers)
  min?: number;
}

export interface EntityDef {
  key: EntityKey;
  table: string;
  label: string;
  plural: string;
  rpc: string;
  titleField: string;
  parent?: { key: EntityKey; param: string; column: string };
  child?: EntityKey;
  fields: FieldDef[];
}

const nameFields: FieldDef[] = [
  {
    name: 'name_en',
    param: 'p_name_en',
    label: 'Name (English)',
    type: 'text',
    required: true,
    max: 200,
  },
  {
    name: 'name_mr',
    param: 'p_name_mr',
    label: 'Name (Marathi, reviewed)',
    type: 'text',
    max: 200,
    help: 'Leave empty until a reviewed Marathi name is available.',
  },
];

const code = (help: string): FieldDef => ({
  name: 'code',
  param: 'p_code',
  label: 'Code',
  type: 'code',
  required: true,
  max: 48,
  help,
});

const order: FieldDef = {
  name: 'sort_order',
  param: 'p_sort_order',
  label: 'Display order',
  type: 'int',
  min: 0,
  max: 999,
};

const sourceField = (help: string): FieldDef => ({
  name: 'source_id',
  param: 'p_source_id',
  label: 'Official source',
  type: 'source',
  help,
});

export const ENTITIES: Record<EntityKey, EntityDef> = {
  sources: {
    key: 'sources',
    table: 'sources',
    label: 'Source',
    plural: 'Sources',
    rpc: 'api_content_save_source',
    titleField: 'title',
    fields: [
      { name: 'kind', param: 'p_kind', label: 'Kind', type: 'kind', required: true },
      { name: 'title', param: 'p_title', label: 'Title', type: 'text', required: true, max: 300 },
      {
        name: 'publisher',
        param: 'p_publisher',
        label: 'Publisher',
        type: 'text',
        max: 200,
        help: 'For example, the exam body.',
      },
      { name: 'url', param: 'p_url', label: 'Link (https://…)', type: 'url', max: 2000 },
      { name: 'published_on', param: 'p_published_on', label: 'Published on', type: 'date' },
      { name: 'retrieved_on', param: 'p_retrieved_on', label: 'Retrieved on', type: 'date' },
      {
        name: 'licence_note',
        param: 'p_licence_note',
        label: 'Licence / permission note',
        type: 'textarea',
        max: 1000,
      },
    ],
  },
  families: {
    key: 'families',
    table: 'exam_families',
    label: 'Exam group',
    plural: 'Exam groups',
    rpc: 'api_content_save_family',
    titleField: 'name_en',
    child: 'exams',
    fields: [code('Short capital-letter code, e.g. MPSC.'), ...nameFields],
  },
  exams: {
    key: 'exams',
    table: 'exams',
    label: 'Exam',
    plural: 'Exams',
    rpc: 'api_content_save_exam',
    titleField: 'name_en',
    parent: { key: 'families', param: 'p_family_id', column: 'family_id' },
    child: 'stages',
    fields: [
      code('e.g. MPSC_RAJYASEVA.'),
      ...nameFields,
      { name: 'state', param: 'p_state', label: 'State', type: 'text', max: 64 },
    ],
  },
  stages: {
    key: 'stages',
    table: 'exam_stages',
    label: 'Stage',
    plural: 'Stages',
    rpc: 'api_content_save_stage',
    titleField: 'name_en',
    parent: { key: 'exams', param: 'p_exam_id', column: 'exam_id' },
    child: 'papers',
    fields: [code('e.g. PRELIMS.'), ...nameFields, order],
  },
  papers: {
    key: 'papers',
    table: 'papers',
    label: 'Paper',
    plural: 'Papers',
    rpc: 'api_content_save_paper',
    titleField: 'name_en',
    parent: { key: 'stages', param: 'p_stage_id', column: 'stage_id' },
    child: 'syllabus',
    fields: [
      code('e.g. GS1.'),
      ...nameFields,
      {
        name: 'duration_min',
        param: 'p_duration_min',
        label: 'Duration (minutes)',
        type: 'int',
        min: 1,
        max: 600,
      },
      {
        name: 'total_marks',
        param: 'p_total_marks',
        label: 'Total marks',
        type: 'decimal',
        min: 0,
        max: 9999,
      },
      {
        name: 'negative_marking',
        param: 'p_negative_marking',
        label: 'Negative marking (fraction of a mark, 0–1)',
        type: 'decimal',
        min: 0,
        max: 1,
      },
      sourceField('Required if you enter duration, marks or negative marking.'),
    ],
  },
  syllabus: {
    key: 'syllabus',
    table: 'syllabus_versions',
    label: 'Syllabus version',
    plural: 'Syllabus versions',
    rpc: 'api_content_save_syllabus',
    titleField: 'label',
    parent: { key: 'papers', param: 'p_paper_id', column: 'paper_id' },
    child: 'subjects',
    fields: [
      {
        name: 'label',
        param: 'p_label',
        label: 'Label',
        type: 'text',
        required: true,
        max: 200,
        help: 'e.g. “Syllabus as notified in 2026”.',
      },
      {
        name: 'effective_from',
        param: 'p_effective_from',
        label: 'Effective from',
        type: 'date',
        required: true,
      },
      sourceField('The official syllabus document this version comes from.'),
    ],
  },
  subjects: {
    key: 'subjects',
    table: 'subjects',
    label: 'Subject',
    plural: 'Subjects',
    rpc: 'api_content_save_subject',
    titleField: 'name_en',
    parent: { key: 'syllabus', param: 'p_syllabus_version_id', column: 'syllabus_version_id' },
    child: 'topics',
    fields: [...nameFields, order],
  },
  topics: {
    key: 'topics',
    table: 'topics',
    label: 'Topic',
    plural: 'Topics',
    rpc: 'api_content_save_topic',
    titleField: 'name_en',
    parent: { key: 'subjects', param: 'p_subject_id', column: 'subject_id' },
    fields: [
      ...nameFields,
      {
        name: 'weight',
        param: 'p_weight',
        label: 'Relative weight',
        type: 'decimal',
        min: 0.001,
        max: 100,
        help: 'Leave at 1 unless the official syllabus or past papers justify more; then add a note.',
      },
      {
        name: 'weight_note',
        param: 'p_weight_note',
        label: 'Why this weight',
        type: 'textarea',
        max: 500,
      },
      {
        name: 'est_learn_min',
        param: 'p_est_learn_min',
        label: 'Estimated learning time (minutes)',
        type: 'int',
        min: 5,
        max: 6000,
      },
      order,
    ],
  },
};

export const SOURCE_KINDS = [
  { value: 'official_notification', label: 'Official notification' },
  { value: 'official_syllabus', label: 'Official syllabus' },
  { value: 'textbook_licensed', label: 'Licensed textbook' },
  { value: 'original', label: 'Original (written by our reviewers)' },
  { value: 'other', label: 'Other' },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  retired: 'Retired',
};

export function isEntityKey(v: string): v is EntityKey {
  return Object.prototype.hasOwnProperty.call(ENTITIES, v);
}

export function entityByTable(table: string): EntityDef | undefined {
  return Object.values(ENTITIES).find((e) => e.table === table);
}

export type ParseResult =
  { ok: true; params: Record<string, string | number | null> } | { ok: false; message: string };

/** Turns form values into RPC parameters for `def`, with friendly validation messages. */
export function toRpcParams(
  def: EntityDef,
  values: Record<string, string | undefined>,
  id: string | null,
  parentId: string | null,
): ParseResult {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (id !== null && !uuid.test(id)) return { ok: false, message: 'Invalid item.' };
  const params: Record<string, string | number | null> = { p_id: id };
  if (def.parent) {
    if (!parentId || !uuid.test(parentId)) return { ok: false, message: 'Missing parent item.' };
    params[def.parent.param] = parentId;
  }
  for (const f of def.fields) {
    const raw = (values[f.name] ?? '').trim();
    if (raw === '') {
      if (f.required) return { ok: false, message: `${f.label} is required.` };
      params[f.param] = null;
      continue;
    }
    switch (f.type) {
      case 'int':
      case 'decimal': {
        const n = Number(raw);
        if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) {
          return {
            ok: false,
            message: `${f.label} must be a ${f.type === 'int' ? 'whole ' : ''}number.`,
          };
        }
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
          return { ok: false, message: `${f.label} must be between ${f.min} and ${f.max}.` };
        }
        params[f.param] = n;
        break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw))
          return { ok: false, message: `${f.label} must be a date.` };
        params[f.param] = raw;
        break;
      case 'url':
        if (!/^https?:\/\/[^\s]+$/i.test(raw))
          return { ok: false, message: `${f.label} must start with https:// or http://` };
        params[f.param] = raw;
        break;
      case 'code':
        if (!/^[A-Za-z0-9_]{2,48}$/.test(raw)) {
          return { ok: false, message: `${f.label}: use 2–48 letters, digits or underscores.` };
        }
        params[f.param] = raw.toUpperCase();
        break;
      case 'source':
        if (!uuid.test(raw)) return { ok: false, message: 'Invalid source.' };
        params[f.param] = raw;
        break;
      case 'kind':
        if (!SOURCE_KINDS.some((k) => k.value === raw))
          return { ok: false, message: 'Choose a source kind.' };
        params[f.param] = raw;
        break;
      default:
        if (f.max !== undefined && raw.length > f.max) {
          return { ok: false, message: `${f.label} is too long (max ${f.max} characters).` };
        }
        params[f.param] = raw;
    }
  }
  return { ok: true, params };
}
