import { z } from 'zod';

/** Display order Monday..Sunday; stored weekday index uses 0 = Sunday. */
export const WEEKDAYS = [
  { index: 1, label: 'Monday' },
  { index: 2, label: 'Tuesday' },
  { index: 3, label: 'Wednesday' },
  { index: 4, label: 'Thursday' },
  { index: 5, label: 'Friday' },
  { index: 6, label: 'Saturday' },
  { index: 0, label: 'Sunday' },
] as const;

/** Allowed choices per day, in minutes (0 = rest day). */
export const MINUTE_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240, 300, 360, 480] as const;

export function formatMinutes(min: number): string {
  if (min === 0) return 'Rest day';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Today's date (YYYY-MM-DD) in India time, so "future" means the same thing for every student. */
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

const minutes = z.coerce
  .number({ message: 'Please choose your study time for every day.' })
  .refine(
    (v) => (MINUTE_OPTIONS as readonly number[]).includes(v),
    'Please choose a listed option.',
  );

export function onboardingSchema(today: string) {
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCFullYear(max.getUTCFullYear() + 3);
  const maxDate = max.toISOString().slice(0, 10);
  return z
    .object({
      paper_id: z.uuid({ message: 'Please choose your exam.' }),
      language: z.enum(['en', 'mr'], { message: 'Please choose a language.' }),
      target_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose a target date.')
        .refine((d) => d > today, 'The target date must be in the future.')
        .refine((d) => d <= maxDate, 'Please choose a date within the next 3 years.'),
      minutes_0: minutes,
      minutes_1: minutes,
      minutes_2: minutes,
      minutes_3: minutes,
      minutes_4: minutes,
      minutes_5: minutes,
      minutes_6: minutes,
    })
    .transform((v) => ({
      paper_id: v.paper_id,
      language: v.language,
      target_date: v.target_date,
      // Index 0 = Sunday, matching the database.
      minutes: [
        v.minutes_0,
        v.minutes_1,
        v.minutes_2,
        v.minutes_3,
        v.minutes_4,
        v.minutes_5,
        v.minutes_6,
      ],
    }))
    .refine((v) => v.minutes.reduce((a, b) => a + b, 0) >= 30, {
      message: 'Please plan at least 30 minutes of study per week.',
    });
}

/** Whole days from `today` until `target` (both YYYY-MM-DD). */
export function daysUntil(target: string, today: string): number {
  return Math.round(
    (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}
