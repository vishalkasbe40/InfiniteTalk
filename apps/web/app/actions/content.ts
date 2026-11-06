'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PostgrestError } from '@supabase/supabase-js';
import type { FormState } from '@/lib/auth/form-state';
import { requireStaff } from '@/lib/auth/staff';
import { ENTITIES, isEntityKey, toRpcParams } from '@/lib/content/entities';

const STAFF = ['admin', 'content_reviewer'] as const;

function friendly(error: PostgrestError): string {
  switch (error.code) {
    case '22023': // our own validation messages from the database functions
      return error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.';
    case '23505':
      return 'That code is already used. Please choose another.';
    case '23514':
      return 'Some values are not allowed. Check the code format, link and numbers (exam facts need a source).';
    case '42501':
      return 'Your two-step session has expired. Please verify again.';
    default:
      return 'Could not save. Please try again.';
  }
}

/** Create (no id) or update a content item; the entity key is bound by the form. */
export async function saveContent(
  entityKey: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  if (!isEntityKey(entityKey)) return { status: 'error', message: 'Unknown content type.' };
  const def = ENTITIES[entityKey];
  const { supabase } = await requireStaff('/admin/content', [...STAFF]);
  const values = Object.fromEntries(
    [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  const parsed = toRpcParams(def, values, values.id || null, values.parent_id || null);
  if (!parsed.ok) return { status: 'error', message: parsed.message, values };
  const { data, error } = await supabase.rpc(def.rpc, parsed.params);
  if (error) return { status: 'error', message: friendly(error), values };
  revalidatePath('/admin/content', 'layout');
  redirect(`/admin/content/${def.key}/${String(data)}`);
}

const NEXT_STATUS = new Set(['draft', 'in_review', 'approved', 'retired']);

export async function setContentStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireStaff('/admin/content', [...STAFF]);
  const key = String(fd.get('entity') ?? '');
  const id = String(fd.get('id') ?? '');
  const status = String(fd.get('status') ?? '');
  if (!isEntityKey(key) || !NEXT_STATUS.has(status))
    return { status: 'error', message: 'Invalid request.' };
  const { error } = await supabase.rpc('api_content_set_status', {
    p_table: ENTITIES[key].table,
    p_id: id,
    p_status: status,
  });
  if (error) return { status: 'error', message: friendly(error) };
  revalidatePath('/admin/content', 'layout');
  return { status: 'sent', message: 'Status updated.' };
}
