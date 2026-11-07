'use client';

import { useActionState } from 'react';
import { saveContent } from '@/app/actions/content';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';
import { EDUCATION_LEVELS, ENTITIES, SOURCE_KINDS, type EntityKey } from '@/lib/content/entities';

export function ContentForm({
  entity,
  initial,
  id,
  parentId,
  sources,
}: {
  entity: EntityKey;
  initial: Record<string, string>;
  id: string | null;
  parentId: string | null;
  sources: { id: string; label: string }[];
}) {
  const def = ENTITIES[entity];
  const [state, action] = useActionState(saveContent.bind(null, entity), idle);
  const typed = state.status === 'error' ? state.values : undefined;
  const value = (name: string) => typed?.[name] ?? initial[name] ?? '';

  return (
    <form
      key={JSON.stringify(typed ?? id ?? 'new')}
      action={action}
      className="stack"
      aria-label={`${def.label} details`}
    >
      {id && <input type="hidden" name="id" value={id} />}
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      {def.fields.map((f) => {
        const fid = `f_${f.name}`;
        const help = f.help ? `${fid}_help` : undefined;
        return (
          <div className="field" key={f.name}>
            <label htmlFor={fid}>
              {f.label}
              {f.required ? ' *' : ''}
            </label>
            {f.type === 'textarea' || f.type === 'relaxations' ? (
              <textarea
                id={fid}
                name={f.name}
                maxLength={f.max}
                defaultValue={value(f.name)}
                aria-describedby={help}
                rows={3}
              />
            ) : f.type === 'education' ? (
              <select
                id={fid}
                name={f.name}
                required={f.required}
                defaultValue={value(f.name)}
                aria-describedby={help}
              >
                <option value="">Choose…</option>
                {EDUCATION_LEVELS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'kind' ? (
              <select
                id={fid}
                name={f.name}
                required={f.required}
                defaultValue={value(f.name)}
                aria-describedby={help}
              >
                <option value="">Choose…</option>
                {SOURCE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'source' ? (
              <select id={fid} name={f.name} defaultValue={value(f.name)} aria-describedby={help}>
                <option value="">None</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={fid}
                name={f.name}
                type={
                  f.type === 'date'
                    ? 'date'
                    : f.type === 'url'
                      ? 'url'
                      : f.type === 'int' || f.type === 'decimal'
                        ? 'number'
                        : 'text'
                }
                step={f.type === 'decimal' ? 'any' : f.type === 'int' ? '1' : undefined}
                min={f.min}
                max={f.type === 'int' || f.type === 'decimal' ? f.max : undefined}
                maxLength={
                  f.type === 'text' || f.type === 'code' || f.type === 'url' ? f.max : undefined
                }
                required={f.required}
                defaultValue={value(f.name)}
                aria-describedby={help}
              />
            )}
            {f.help && (
              <p className="why" id={help}>
                {f.help}
              </p>
            )}
          </div>
        );
      })}
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">
        {id ? 'Save changes' : `Create ${def.label.toLowerCase()}`}
      </SubmitButton>
    </form>
  );
}
