import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENTITIES, type EntityDef } from './entities';

export type Row = Record<string, unknown> & { id: string; status: string };

export async function loadItem(
  supabase: SupabaseClient,
  def: EntityDef,
  id: string,
): Promise<Row | null> {
  const { data, error } = await supabase.from(def.table).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('could not load item');
  return data as Row | null;
}

export async function loadChildren(
  supabase: SupabaseClient,
  def: EntityDef,
  id: string,
): Promise<Row[]> {
  if (!def.child) return [];
  const child = ENTITIES[def.child];
  const query = supabase.from(child.table).select('*').eq(child.parent!.column, id);
  const ordered = child.fields.some((f) => f.name === 'sort_order')
    ? query.order('sort_order').order(child.titleField)
    : query.order(child.titleField);
  const { data, error } = await ordered;
  if (error) throw new Error('could not load children');
  return data as Row[];
}

export async function loadTopLevel(supabase: SupabaseClient, def: EntityDef): Promise<Row[]> {
  const { data, error } = await supabase.from(def.table).select('*').order(def.titleField);
  if (error) throw new Error('could not load items');
  return data as Row[];
}

/** Sources that can be cited (not retired). */
export async function loadSourceOptions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('sources')
    .select('id, title, status')
    .neq('status', 'retired')
    .order('title');
  if (error) throw new Error('could not load sources');
  return data.map((s) => ({
    id: s.id as string,
    label: `${s.title}${s.status === 'approved' ? '' : ` (${s.status})`}`,
  }));
}

export interface Crumb {
  href: string;
  label: string;
}

/** Breadcrumbs from the top of the tree down to (but excluding) `def`/`row`. */
export async function loadCrumbs(
  supabase: SupabaseClient,
  def: EntityDef,
  parentId: string | null,
): Promise<Crumb[]> {
  const crumbs: Crumb[] = [];
  let current = def.parent;
  let id = parentId;
  while (current && id) {
    const pdef = ENTITIES[current.key];
    const row = await loadItem(supabase, pdef, id);
    if (!row) break;
    crumbs.unshift({
      href: `/admin/content/${pdef.key}/${row.id}`,
      label: `${pdef.label}: ${String(row[pdef.titleField])}`,
    });
    id = pdef.parent ? (row[pdef.parent.column] as string) : null;
    current = pdef.parent;
  }
  return crumbs;
}
