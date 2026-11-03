# ExamSaathi AI — Data Model (MVP)

Status: **Draft v0.1 — Milestone 0**. Postgres (Supabase). All tables are in `public` with RLS enabled.
Conventions: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`,
`updated_at` maintained by trigger where rows are mutable. Text enums use Postgres `enum` types or
`check` constraints. `auth.users` is owned by Supabase; app data references it via `profiles.id`.

Legend for the **RLS** column:
- **own**: the student can read and write rows where `student_id = auth.uid()` (or `id = auth.uid()`)
- **own-ro**: the student can read their own rows; writes happen only through server functions
- **approved-read**: authenticated users can read rows where `status = 'approved'`; only `content_reviewer`/`admin` can write
- **admin**: only `admin` (and `content_reviewer` where noted) can read or write
- **insert-only**: inserts by the server; no update or delete for anyone

## 1. Identity, consent, preferences

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `profiles` | `id` (= auth.users.id), `display_name`, `preferred_language` (`en`,`mr`), `ui_language`, `timezone` (default `Asia/Kolkata`), `deleted_at` | own | No phone, DOB, address or category in the MVP. |
| `user_roles` | `user_id`, `role` (`student`,`content_reviewer`,`admin`), `granted_by`, `granted_at` | admin (users can read their own) | Read by `has_role()`. Grants are audited. |
| `consents` | `user_id`, `kind` (`privacy_notice`,`terms`,`age_18_plus`,`email_reminders`), `version`, `granted bool`, `at` | own-ro, insert-only | Withdrawal is a new row with `granted=false`; the latest row wins. |
| `notification_preferences` | `user_id` pk, `in_app bool`, `email bool`, `quiet_start time`, `quiet_end time`, `paused_until timestamptz`, `max_per_day int` | own | Email is sent only if a `consents.email_reminders` row exists and is granted. |

## 2. Exam taxonomy and syllabus (content)

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `exam_families` | `code` (e.g. `MPSC`), `name_en`, `name_mr` | approved-read | Supports SSC, Banking etc. later. |
| `exams` | `family_id`, `code` (`MPSC_RAJYASEVA`), `name_en`, `name_mr`, `state`, `status` | approved-read | |
| `exam_stages` | `exam_id`, `code` (`PRELIMS`), `order` | approved-read | |
| `papers` | `stage_id`, `code` (`GS1`), `duration_min`, `total_marks`, `negative_marking numeric`, `status` | approved-read | Marking scheme must cite a `source_id`. |
| `syllabus_versions` | `paper_id`, `label`, `effective_from`, `source_id`, `status` (`draft`,`approved`,`retired`) | approved-read | Students are pinned to a version. |
| `subjects` | `syllabus_version_id`, `name_en`, `name_mr`, `order` | approved-read | |
| `topics` | `subject_id`, `parent_topic_id` (subtopics), `name_en`, `name_mr`, `weight numeric`, `est_learn_min`, `status` | approved-read | `weight` must be justified (source or note). |
| `topic_prerequisites` | `topic_id`, `requires_topic_id` | approved-read | Cycle check in a trigger. |
| `sources` | `kind` (`official_notification`,`official_syllabus`,`textbook_licensed`,`original`,`other`), `title`, `publisher`, `url`, `published_on`, `retrieved_on`, `licence_note` | approved-read | The source register. `original` = written by ExamSaathi reviewers. |

## 3. Learning content and questions

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `content_items` | `topic_id`, `kind` (`explainer`,`summary`,`example`), `language`, `body_md`, `version int`, `status` (`draft`,`in_review`,`approved`,`retired`), `origin` (`human`,`ai_draft`,`import`), `source_id`, `reviewed_by`, `reviewed_at` | approved-read | AI drafts start as `draft` and must be approved by a human. Edits create a new version. |
| `content_translations` | `content_item_id`, `language`, `body_md`, `translator` (`human`,`machine`), `status` | approved-read | Only `status='approved'` Marathi is shown; otherwise English plus a label. |
| `questions` | `topic_id`, `subtopic_id`, `syllabus_version_id`, `type` (`mcq_single`), `difficulty smallint 1–5`, `language`, `stem_md`, `options jsonb` (id + text), `source_id`, `pyq_year int null`, `pyq_verified bool`, `origin`, `status`, `version`, `reviewed_by`, `reviewed_at` | approved-read (stem/options only) | `pyq_year` requires `pyq_verified = true` and an `official_*` source (check constraint plus review). |
| `question_answers` | `question_id` pk, `correct_option_id`, `explanation_md`, `explanation_source_id`, `dispute_status` (`none`,`flagged`,`under_review`,`resolved`) | **no direct student read** | Returned only by the `reveal_answer(attempt_response_id)` server function after submission. |
| `content_chunks` | `owner_type` (`content_item`,`question_answer`), `owner_id`, `owner_version`, `language`, `text`, `tsv tsvector`, `embedding vector(…)`, `active bool` | admin; read via a retrieval function only | Rebuilt when content is approved. |
| `content_reports` | `reporter_id`, `target_type`, `target_id`, `reason`, `detail` (≤ 500 chars), `status`, `resolved_by` | reporter can insert and read their own; admin | Students' "this looks wrong" reports. |

## 4. Assessment and practice

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `assessments` | `paper_id`, `kind` (`diagnostic`,`practice`,`mock`), `title`, `duration_min null`, `status` | approved-read | Templates. Item lists are generated server-side. |
| `attempts` | `student_id`, `assessment_id null`, `kind`, `started_at`, `submitted_at`, `seed int`, `status` (`in_progress`,`submitted`,`abandoned`), `score_raw numeric null` | own-ro | Created and submitted through server actions. |
| `attempt_items` | `attempt_id`, `question_id`, `question_version`, `position` | own-ro | Pins the exact item version served. |
| `attempt_responses` | `attempt_item_id`, `chosen_option_id null`, `is_correct bool null`, `response_ms int`, `confidence` (`sure`,`unsure`,`guess`, null), `answered_at` | own-ro | `is_correct` is computed server-side on submit. Unanswered = null choice. |
| `mistake_notebook` | `student_id`, `question_id`, `first_wrong_at`, `last_seen_at`, `times_wrong`, `resolved_at`, `note` (student text, ≤ 1000) | own | |

## 5. Learning state and plans

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `student_exam_goals` | `student_id`, `paper_id`, `syllabus_version_id`, `target_date`, `active bool` | own | One active goal in the MVP (partial unique index). |
| `study_availability` | `student_id`, `weekday 0–6`, `minutes int 0–720`, `is_rest_day bool` | own | |
| `topic_mastery` | `student_id`, `topic_id`, `alpha`, `beta`, `effective_n`, `band`, `updated_at` | own-ro | Written only by the server mastery function. |
| `learning_events` | `student_id`, `kind` (`item_answered`,`content_viewed`,`tutor_explained`,`task_completed`,…), `topic_id`, `ref_type`, `ref_id`, `payload jsonb` (no free text), `at` | own-ro, insert-only | Evidence trail for mastery. |
| `study_plans` | `student_id`, `goal_id`, `active_version_id`, `status` | own-ro | |
| `study_plan_versions` | `plan_id`, `version int`, `generated_at`, `planner_version`, `inputs_hash`, `feasibility` (`ok`,`tight`,`insufficient`), `change_reason`, `accepted_at null`, `explanation_md` | own-ro, insert-only | Immutable. The active version must have `accepted_at`. |
| `plan_tasks` | `plan_version_id`, `date`, `type` (`learn`,`practice`,`revise`,`mock`,`buffer`), `topic_id null`, `est_min`, `reason_code`, `status` (`planned`,`done`,`missed`,`skipped`), `deferral_count`, `completed_at` | own (status only, via server action) | Status changes emit `learning_events`. |
| `plan_proposals` | `plan_id`, `base_version_id`, `proposed_version_id`, `trigger` (`missed_tasks`,`student_request`,`mastery_shift`), `status` (`pending`,`accepted`,`declined`,`expired`) | own-ro (accept/decline via server action) | |

## 6. AI tutor and usage

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `tutor_sessions` | `student_id`, `mode` (`explain`,`quiz`,`revise`,`review_progress`), `topic_id null`, `started_at`, `turns int`, `ended_at` | own-ro | |
| `tutor_messages` | `session_id`, `role` (`student`,`assistant`,`tool`), `content`, `citations jsonb`, `flags jsonb` (e.g. `unverified`), `at`, `expires_at` | own-ro (students can delete their own) | Deleted after 30 days by cron (retention TBC by the founder). |
| `ai_usage` | `user_id`, `feature`, `provider`, `model`, `input_tokens`, `output_tokens`, `cost_inr_est numeric`, `latency_ms`, `error_code`, `at` | admin (users can read their own aggregates via a view) | |
| `ai_quotas` | `user_id`, `day date`, `tutor_turns_used int` | own-ro | Checked and incremented atomically by `consume_tutor_turn()`. |
| `ai_answer_cache` | `key` (topic_id, language, content_version, prompt_version), `response`, `created_at` | service only | Non-personal explanations only. |

## 7. Operations

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `notifications` | `user_id`, `kind`, `title_key`, `params jsonb`, `channel` (`in_app`,`email`), `scheduled_for`, `sent_at`, `read_at` | own (mark read) | Respects preferences and quiet hours at send time. |
| `audit_log` | `actor_id`, `action`, `entity_type`, `entity_id`, `before_hash`, `after_hash`, `meta jsonb`, `at` | admin read, insert-only | |
| `analytics_events` | `user_id`, `name`, `props jsonb` (allow-listed keys), `at` | admin read, insert-only | |
| `data_requests` | `user_id`, `kind` (`export`,`delete`), `status`, `requested_at`, `completed_at` | own (insert and read) | Deletion: soft-delete immediately, hard-delete after 30 days (TBC by counsel). |
| `rate_limits` | `bucket_key`, `tokens`, `refilled_at` | service only | |

## 8. Integrity rules worth testing
1. A question shown to a student must have `status='approved'` at serve time (`attempt_items` insert check).
2. `pyq_year is not null` ⇒ `pyq_verified` and the source is an `official_*` kind.
3. Only one active `student_exam_goals` row per student.
4. `study_plan_versions` rows are never updated except to set `accepted_at` once (trigger).
5. `plan_tasks` daily sum of `est_min` ≤ that weekday's `study_availability.minutes` (checked in domain code plus a test).
6. `question_answers` are never readable by students except through `reveal_answer` after submit.
7. No student can read another student's rows in any table in §1, §4, §5 or §6 (pgTAP matrix).
8. Content status transitions follow `draft → in_review → approved → retired`; `approved` requires `reviewed_by ≠ author`
   once a second reviewer exists (a single-founder exception is logged).

## 9. Out of model for the MVP (reserved names)
`teachers`, `teacher_verifications`, `bookings`, `payments`, `payouts`, `reviews` (Phase 2);
`community_posts`, `comments`, `reports`, `moderation_actions` (Phase 3);
`whatsapp_opt_ins`, `voice_sessions` (Phase 4).
