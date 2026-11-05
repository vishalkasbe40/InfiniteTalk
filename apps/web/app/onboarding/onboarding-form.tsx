'use client';

import { useActionState } from 'react';
import { saveOnboarding } from '@/app/actions/onboarding';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';
import { formatMinutes, MINUTE_OPTIONS, WEEKDAYS } from '@/lib/onboarding/schema';
import type { PaperOption, StudentGoal } from '@/lib/onboarding/data';

function Why({ children }: { children: string }) {
  return <p className="why">Why we ask: {children}</p>;
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
  return (
    <form action={action} className="stack" aria-label="Your preparation">
      <fieldset>
        <legend>1. Which exam are you preparing for?</legend>
        <Why>so your plan and practice match the right syllabus.</Why>
        {papers.map((p, i) => (
          <label className="check" key={p.id}>
            <input
              type="radio"
              name="paper_id"
              value={p.id}
              required
              defaultChecked={goal ? goal.paperId === p.id : papers.length === 1 && i === 0}
            />
            <span>{p.label}</span>
          </label>
        ))}
        <p className="notice small">
          Eligibility (age, education, category and other rules) must be checked against the latest
          official notification on the MPSC website. ExamSaathi does not decide eligibility.
        </p>
      </fieldset>

      <fieldset>
        <legend>2. Which language do you want to study in?</legend>
        <Why>to show explanations in your language where reviewed content exists.</Why>
        <label className="check">
          <input
            type="radio"
            name="language"
            value="en"
            required
            defaultChecked={goal?.language !== 'mr'}
          />
          <span>English</span>
        </label>
        <label className="check">
          <input type="radio" name="language" value="mr" defaultChecked={goal?.language === 'mr'} />
          <span lang="mr">मराठी (Marathi)</span>
        </label>
        <p className="muted small">
          Marathi study material is being added gradually; English is used until then.
        </p>
      </fieldset>

      <fieldset>
        <legend>3. By when do you want to be ready?</legend>
        <Why>to spread your study plan over the time you have.</Why>
        <label>
          Target date
          <input
            type="date"
            name="target_date"
            required
            min={minDate}
            max={maxDate}
            defaultValue={goal?.targetDate}
          />
        </label>
        <p className="muted small">
          Use your own target. Official exam dates are announced by MPSC; always check the latest
          notification.
        </p>
      </fieldset>

      <fieldset>
        <legend>4. How much time can you study each day?</legend>
        <Why>
          so your plan never asks for more time than you have. Choose “Rest day” for days off.
        </Why>
        <div className="week">
          {WEEKDAYS.map((d) => (
            <label key={d.index}>
              {d.label}
              <select
                name={`minutes_${d.index}`}
                required
                defaultValue={goal ? String(goal.minutesByWeekday[d.index]) : ''}
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
            </label>
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
