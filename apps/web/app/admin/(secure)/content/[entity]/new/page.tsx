import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth/staff';
import { loadCrumbs, loadSourceOptions } from '@/lib/content/data';
import { ENTITIES, isEntityKey } from '@/lib/content/entities';
import { ContentForm } from '../../content-form';

export const metadata: Metadata = { title: 'New item · ExamSaathi admin' };

export default async function NewContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity } = await params;
  if (!isEntityKey(entity)) notFound();
  const def = ENTITIES[entity];
  const { supabase } = await requireStaff(`/admin/content/${entity}/new`, [
    'admin',
    'content_reviewer',
  ]);
  const parent = (await searchParams).parent;
  const parentId =
    typeof parent === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parent)
      ? parent
      : null;
  if (def.parent && !parentId) notFound();
  const [crumbs, sources] = await Promise.all([
    loadCrumbs(supabase, def, parentId),
    def.fields.some((f) => f.type === 'source') ? loadSourceOptions(supabase) : Promise.resolve([]),
  ]);
  if (def.parent && crumbs.length === 0) notFound();

  return (
    <main>
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href={entity === 'sources' ? '/admin/content/sources' : '/admin/content'}>
          {entity === 'sources' ? 'Sources' : 'Exams and syllabus'}
        </Link>
        {crumbs.map((c) => (
          <span key={c.href}>
            {' › '}
            <Link href={c.href}>{c.label}</Link>
          </span>
        ))}
      </nav>
      <h1>New {def.label.toLowerCase()}</h1>
      <ContentForm entity={entity} initial={{}} id={null} parentId={parentId} sources={sources} />
    </main>
  );
}
