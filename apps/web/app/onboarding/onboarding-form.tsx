'use client';

import { useActionState } from 'react';
import { saveOnboarding } from '@/app/actions/onboarding';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';
import { formatMinutes, MINUTE_OPTIONS, WEEKDAYS } from '@/lib/onboarding/schema';
import type { PaperOption, StudentGoal } from '@/lib/onboarding/data';

function Why({ id, children }: { id: string; children: string }) {
  return (
    <p className="why" id={id}>
      Why we ask: {children}
    </p>
  );
}

export function OnboardingForm({
  papers,
  goal,
  minDate,
  maxDate,
}: {
  papers: PaperOption[];
  goal: StudentGoal | null;
  minDate: string;
  maxDate: string;
}) {
  const [state, action] = useActionState(saveOnboarding, idle);

  // React resets the form after every submit, so after an error we re-fill what the student
  // typed; otherwise their saved answers; otherwise sensible empty defaults (review 0004 #1).
  const typed = state.status === 'error' ? state.values : undefined;
  const paperId =
    typed?.paper_id ?? goal?.paperId ?? (papers.length === 1 ? papers[0]?.id : undefined);
  const language = typed?.language ?? goal?.language ?? 'en';
  const targetDate = typed?.target_date ?? goal?.targetDate ?? '';
  const minutesFor = (weekday: number) =>
    typed?.[`minutes_${weekday}`] ?? (goal ? String(goal.minutesByWeekday[weekday]) : '');

  // A key that changes with the defaults makes React re-create the inputs with them.
  const formKey = JSON.stringify(typed ?? goal?.paperId ?? 'new');

  return (
    <form key={formKey} action={action} className="stack" aria-label="Your preparation">
      <fieldset aria-describedby="why-exam">
        <legend>1. Which exam are you preparing for?</legend>
        <Why id="why-exam">so your plan and practice match the right syllabus.</Why>
        {papers.map((p) => (
          <label className="check" key={p.id}>
            <input
              type="radio"
              name="paper_id"
              value={p.id}
              required
              defaultChecked={paperId === p.id}
            />
            <span>{p.label}</span>
          </label>
        ))}
        <p className="notice small">
          Eligibility (age, education, category and other rules) must be checked against the latest
          official notification from the exam body. ExamSaathi does not decide eligibility.
        </p>
      </fieldset>

      <fieldset aria-describedby="why-language">
        <legend>2. Which language do you want to study in?</legend>
        <Why id="why-language">
          to show explanations in your language where reviewed content exists.
        </Why>
        <label className="check">
          <input
            type="radio"
            name="language"
            value="en"
            required
            defaultChecked={language !== 'mr'}
          />
          <span>English</span>
        </label>
        <label className="check">
          <input type="radio" name="language" value="mr" defaultChecked={language === 'mr'} />
          <span lang="mr">मराठी (Marathi)</span>
        </label>
        <p className="muted small">
          Marathi study material is being added gradually; English is used until then.
        </p>
      </fieldset>

      <fieldset aria-describedby="why-date">
        <legend>3. By when do you want to be ready?</legend>
        <Why id="why-date">to spread your study plan over the time you have.</Why>
        <label htmlFor="target_date">Target date</label>
        <input
          id="target_date"
          type="date"
          name="target_date"
          required
          min={minDate}
          max={maxDate}
          defaultValue={targetDate}
        />
        <p className="muted small">
          Use your own target. Official exam dates are announced by the exam body; always check the
          latest notification.
        </p>
      </fieldset>

      <fieldset aria-describedby="why-time">
        <legend>4. How much time can you study each day?</legend>
        <Why id="why-time">
          so your plan never asks for more time than you have. Choose “Rest day” for days off.
        </Why>
        <div className="week">
          {WEEKDAYS.map((d) => (
            <div className="day" key={d.index}>
              <label htmlFor={`minutes_${d.index}`}>{d.label}</label>
              <select
                id={`minutes_${d.index}`}
                name={`minutes_${d.index}`}
                required
                defaultValue={minutesFor(d.index)}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">
        {goal ? 'Save changes' : 'Save and continue'}
      </SubmitButton>
    </form>
  );
}
