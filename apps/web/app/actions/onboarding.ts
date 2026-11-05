'use server';

import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/auth/form-state';
import { requireStudent } from '@/lib/auth/guard';
import { firstIssue } from '@/lib/auth/schemas';
import { onboardingSchema, todayInIndia } from '@/lib/onboarding/schema';

export async function saveOnboarding(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireStudent('/onboarding');
  const parsed = onboardingSchema(todayInIndia()).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const v = parsed.data;
  // The database re-validates everything and only ever writes the caller's own rows.
  const { error } = await supabase.rpc('api_save_onboarding', {
    p_paper_id: v.paper_id,
    p_language: v.language,
    p_target_date: v.target_date,
    p_minutes: v.minutes,
  });
  if (error) {
    return {
      status: 'error',
      message:
        error.code === '22023'
          ? 'Some answers were not accepted. Please check the form and try again.'
          : 'Something went wrong on our side. Please try again in a few minutes.',
    };
  }
  redirect('/dashboard');
}
