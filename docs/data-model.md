# ExamSaathi AI — Data Model (MVP)

Status: **Draft v0.1 — Milestone 0**. Postgres (Supabase). All tables are in `public` with RLS enabled.
Conventions: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`,
`updated_at` maintained by trigger where rows are mutable. Text enums use Postgres `enum` types or
`check` constraints. `auth.users` is owned by Supabase; app data references it via `profiles.id`.

Legend for the **RLS** column:
- **own**: the student can read and write rows where `student_id = auth.uid()` (or `id = auth.uid()`)
- **own-ro**: the student can read their own rows; `authenticated` has **no** insert/update/delete grant;
  writes happen only through RPCs per [ADR 0003](decisions/0003-privileged-db-functions.md)
- **own (cols: …)**: a row-level own policy *plus* column-level `UPDATE` grants limited to the listed columns
  (RLS alone can't restrict columns)
- **approved-read**: authenticated users can read rows where `status = 'approved'`; only `content_reviewer`/`admin` can write
- **admin**: only `admin` (and `content_reviewer` where noted) can read or write
- **insert-only**: inserts by the server; no update or delete for anyone

## 1. Identity, consent, preferences

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `profiles` | `id` (= auth.users.id), `display_name`, `preferred_language` (`en`,`mr`), `ui_language`, `timezone` (default `Asia/Kolkata`), `deleted_at` | own (cols: display_name, preferred_language, ui_language, timezone) | No phone, DOB, address or category in the MVP. |
| `user_roles` | `user_id`, `role` (`student`,`content_reviewer`,`admin`), `granted_by`, `granted_at` | admin (users can read their own) | Read by `has_role()`. Grants are audited. |
| `consent_documents` | pk `(kind, version)`, `published_at` | authenticated read; written by the founder/service role | Each published privacy notice / terms version. Consent can only reference a published version (FK). |
| `consents` | `user_id` (no FK, so rows survive account deletion as evidence), `kind` (`privacy_notice`,`terms`,`age_18_plus`,`email_reminders`), `version`, `granted bool`, `at` | own-ro, insert-only | Withdrawal is a new row with `granted=false`; the latest row wins. |
| `notification_preferences` | `user_id` pk, `in_app bool`, `email bool`, `quiet_start time`, `quiet_end time`, `paused_until timestamptz`, `max_per_day int` | own | Email is sent only if a `consents.email_reminders` row exists and is granted. |

## 2. Exam taxonomy and syllabus (content)

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `exam_families` | `code` (e.g. `MPSC`), `name_en`, `name_mr`, `status` | approved-read | Supports SSC, Banking etc. later. |
| `exams` | `family_id`, `code` (`MPSC_RAJYASEVA`), `name_en`, `name_mr`, `state`, `status` | approved-read | |
| `exam_stages` | `exam_id`, `code` (`PRELIMS`), `order`, `status` | approved-read | |
| `papers` | `stage_id`, `code` (`GS1`), `name_en/mr`, `duration_min`, `total_marks`, `negative_marking numeric`, `source_id`, `status` | approved-read | Exam facts may stay empty; if any is set, `source_id` is required (check constraint). |
| `syllabus_versions` | `paper_id`, `label`, `effective_from`, `source_id`, `status` (`draft`,`approved`,`retired`) | approved-read | Students are pinned to a version. |
| `subjects` | `syllabus_version_id`, `name_en`, `name_mr`, `order`, `status` | approved-read | |
| `topics` | `subject_id`, `parent_topic_id` (subtopics), `name_en`, `name_mr`, `weight numeric`, `est_learn_min`, `status` | approved-read | `weight` must be justified (source or note). |
| `topic_prerequisites` | `topic_id`, `requires_topic_id` | readable when both topics are approved | Cycle check in a trigger. |
| `sources` | `status`, `kind` (`official_notification`,`official_syllabus`,`textbook_licensed`,`original`,`other`), `title`, `publisher`, `url`, `published_on`, `retrieved_on`, `licence_note` | approved-read | The source register. `original` = written by ExamSaathi reviewers. |

## 3. Learning content and questions

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `content_items` | `topic_id`, `kind` (`explainer`,`summary`,`example`), `language`, `body_md`, `version int`, `status` (`draft`,`in_review`,`approved`,`retired`), `origin` (`human`,`ai_draft`,`import`), `source_id`, `reviewed_by`, `reviewed_at` | approved-read | AI drafts start as `draft` and must be approved by a human. Edits create a new version. |
| `content_translations` | `content_item_id`, `language`, `body_md`, `translator` (`human`,`machine`), `status` | approved-read | Only `status='approved'` Marathi is shown; otherwise English plus a label. |
| `questions` | `topic_id`, `subtopic_id`, `syllabus_version_id`, `type` (`mcq_single`), `difficulty smallint 1–5`, `language`, `stem_md`, `options jsonb` (only `{id, text}`; enforced by a check constraint), `pool` (`assessment`,`practice`), `source_id`, `pyq_year int null`, `pyq_verified bool`, `origin`, `status`, `version`, `reviewed_by`, `reviewed_at` | admin/reviewer; **no direct student read**. Served only via an RPC returning the caller's own `attempt_items` | `pyq_year` requires `pyq_verified = true` and an `official_*` source (check constraint plus review). Published versions are immutable; an edit creates a new version. |
| `question_answers` | pk `(question_id, question_version)`, `correct_option_id`, `explanation_md`, `explanation_source_id`, `dispute_status` (`none`,`flagged`,`under_review`,`resolved`) | **no student select policy** | Returned only by `reveal_answer(attempt_item_id)` (ownership + submitted/answered checks). While `dispute_status ≠ none`, the item is not served, is excluded from scoring and mastery, and shows "under review". Rescoring of past attempts runs only as an explicit, audited admin job. |
| `content_chunks` | `owner_type` (`content_item`,`question_answer`), `owner_id`, `owner_version`, `language`, `text`, `tsv tsvector`, `embedding vector(…)`, `active bool` | admin; read via a retrieval function only | Rebuilt when content is approved. The student retrieval function excludes `question_answer` chunks. |
| `content_reports` | `reporter_id`, `target_type`, `target_id`, `reason`, `detail` (≤ 500 chars), `status`, `resolved_by` | reporter can insert and read their own; admin | Students' "this looks wrong" reports. |

## 4. Assessment and practice

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `assessments` | `paper_id`, `kind` (`diagnostic`,`practice`,`mock`), `title`, `duration_min null`, `status` | approved-read | Templates. Item lists are generated server-side. |
| `attempts` | `student_id`, `assessment_id null`, `kind`, `started_at`, `submitted_at`, `seed int`, `status` (`in_progress`,`submitted`,`abandoned`), `score_raw numeric null` | own-ro | Created and submitted through server actions. |
| `attempt_items` | `attempt_id`, `question_id`, `question_version`, `position` | own-ro | Pins the exact item version served. |
| `attempt_responses` | `attempt_item_id`, `chosen_option_id null`, `is_correct bool null`, `response_ms int` (server-clamped), `confidence` (`sure`,`unsure`,`guess`, null), `answered_at` | own-ro | `is_correct` is computed by the server: on submit for mock/diagnostic, per item for practice (the item then locks). Responses after `started_at + duration + grace` are rejected. Unanswered = null choice. |
| `mistake_notebook` | `student_id`, `question_id`, `first_wrong_at`, `last_seen_at`, `times_wrong`, `resolved_at`, `note` (student text, ≤ 1000) | own (cols: note, resolved_at) | Counters are written by the server only. |

## 5. Learning state and plans

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `student_exam_goals` | `student_id`, `paper_id`, `syllabus_version_id`, `target_date`, `active bool` | own-ro (set via the onboarding RPC) | One active goal in the MVP (partial unique index). The RPC rejects non-approved syllabus versions. |
| `study_availability` | `student_id`, `weekday 0–6` (0 = Sunday), `minutes 0–720`, `is_rest_day` (generated: minutes = 0) | own-ro (set via `api_save_onboarding`) | |
| `topic_mastery` | `student_id`, `topic_id`, `alpha`, `beta`, `effective_n`, `band`, `updated_at` | own-ro | Written only by the server mastery function. |
| `learning_events` | `student_id`, `kind` (`item_answered`,`content_viewed`,`tutor_explained`,`tutor_hint_given`,`task_completed`,…), `evidentiary bool`, `topic_id`, `ref_type`, `ref_id`, `payload jsonb` (no free text), `at` | own-ro, insert-only | Only server-graded `item_answered` events are `evidentiary = true` and feed mastery. The tutor tool may emit only non-evidentiary kinds. |
| `study_plans` | `student_id`, `goal_id`, `active_version_id`, `status` | own-ro | |
| `study_plan_versions` | `plan_id`, `version int`, `generated_at`, `planner_version`, `inputs_hash`, `feasibility` (`ok`,`tight`,`insufficient`), `change_reason`, `accepted_at null`, `explanation_md` | own-ro, insert-only | Immutable. The active version must have `accepted_at`. |
| `plan_tasks` | `plan_version_id`, `date`, `type` (`learn`,`practice`,`revise`,`mock`,`buffer`), `topic_id null`, `est_min`, `reason_code`, `status` (`planned`,`done`,`missed`,`skipped`), `deferral_count`, `completed_at` | own-ro (status changes only via the `set_task_status` RPC) | Status changes emit `learning_events`. |
| `plan_proposals` | `plan_id`, `base_version_id`, `proposed_version_id`, `trigger` (`missed_tasks`,`student_request`,`mastery_shift`), `status` (`pending`,`accepted`,`declined`,`expired`) | own-ro (accept/decline via server action) | |

## 6. AI tutor and usage

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `tutor_sessions` | `student_id`, `mode` (`explain`,`quiz`,`revise`,`review_progress`), `topic_id null`, `started_at`, `turns int`, `ended_at` | own-ro | |
| `tutor_messages` | `session_id`, `role` (`student`,`assistant`,`tool`), `content`, `citations jsonb`, `flags jsonb` (e.g. `unverified`), `at`, `expires_at` | own-ro (students can delete their own) | Deleted after 30 days by cron (retention TBC by the founder, D8). Not summarised by an LLM. |
| `ai_usage` | `user_id`, `feature`, `provider`, `model`, `input_tokens`, `output_tokens`, `cost_inr_est numeric`, `latency_ms`, `error_code`, `at` | admin (users can read their own aggregates via a view) | |
| `ai_quotas` | `user_id`, `day date`, `tutor_turns_used int` | own-ro | Checked and incremented atomically by `consume_tutor_turn()`. |
| `ai_answer_cache` | `key` (topic_id, language, content_version, prompt_version), `response`, `created_at` | service only | Non-personal explanations only. |

## 7. Operations

| Table | Key columns | RLS | Notes |
|---|---|---|---|
| `notifications` | `user_id`, `kind`, `title_key`, `params jsonb`, `channel` (`in_app`,`email`), `scheduled_for`, `sent_at`, `read_at` | own (cols: read_at) | Respects preferences and quiet hours at send time. |
| `audit_log` | `actor_id`, `action`, `entity_type`, `entity_id`, `before_hash`, `after_hash`, `meta jsonb`, `at` | admin read, insert-only | |
| `analytics_events` | `user_ref` (HMAC of user id; treated as personal data), `name`, `props jsonb` (allow-listed keys), `at` | admin read, insert-only | |
| `data_requests` | `user_id`, `kind` (`export`,`delete`), `status`, `requested_at`, `completed_at` | own (insert and read) | Deletion: soft-delete immediately, hard-delete after 30 days (TBC by counsel). |
| `rate_limits` | `bucket_key`, `tokens`, `refilled_at` | service only | |

## 8. Integrity rules worth testing
1. A question shown to a student must have `status='approved'` at serve time (`attempt_items` insert check).
2. `pyq_year is not null` ⇒ `pyq_verified` and the source is an `official_*` kind.
3. Only one active `student_exam_goals` row per student.
4. `study_plan_versions` rows are never updated except to set `accepted_at` once (trigger).
5. `plan_tasks` daily sum of `est_min` ≤ that weekday's `study_availability.minutes` (checked in domain code plus a test).
6. `question_answers` and `questions` are never readable by students except through their RPCs; the student retrieval
   function never returns `question_answer` chunks; no tutor or practice access to the items of an in-progress mock/diagnostic.
7. No student can read or write another student's rows in **any** user-linked table (§1, §3 `content_reports`, §4–§7),
   and every function exposed to `authenticated` has a DB policy test for cross-user and forged-argument denial.
8. Content status transitions follow `draft → in_review → approved → retired`; `approved` requires `reviewed_by ≠ author`
   once a second reviewer exists (a single-founder exception is logged).
9. Direct PostgREST `insert/update/delete` from `authenticated` on any `own-ro` table fails.
10. `has_role('admin')` is false for an `aal1` session.

## 8a. Personal-data inventory: deletion, export, retention

| Data | On deletion request | In export | Retention |
|---|---|---|---|
| `auth.users` | Deleted via the admin API (service role, server job) | email | Account lifetime |
| `profiles`, `notification_preferences`, `student_exam_goals`, `study_availability` | Delete | Yes | Account lifetime |
| `attempts*`, `mistake_notebook`, `topic_mastery`, `learning_events`, `study_plan*`, `plan_tasks`, `plan_proposals` | Delete | Yes | Account lifetime |
| `tutor_sessions`, `tutor_messages` | Delete | Yes | Messages 30 days (D8) |
| `notifications` | Delete | No | 90 days |
| `ai_usage`, `ai_quotas` | Anonymise (null `user_id`) | Aggregates | 13 months, for cost accounting |
| `analytics_events` | Delete by `user_ref` | No | 13 months |
| `content_reports` | Anonymise `reporter_id` | Yes | Until resolved + 1 year |
| `consents`, `audit_log` | **Retain** as evidence (legal review, R1) | `consents`: yes | TBC by counsel |
| Backups / PITR | Expire with the backup window | — | Stated in the privacy notice |
| Third parties (AI provider, email, error tracker) | Covered by the vendors' DPA/retention terms | — | Vendor terms (R2) |

Deletion soft-deletes immediately (sessions revoked, data hidden) and hard-deletes within 30 days. An end-to-end
test runs the deletion job against a fictional user and asserts that no rows remain except the retained ones.
"Inspect and correct": the student can view all their data in the export, and can flag a wrong baseline estimate
("this doesn't look right"), which triggers a re-check practice set rather than a manual edit of mastery.

## 9. Out of model for the MVP (reserved names)
`teachers`, `teacher_verifications`, `bookings`, `payments`, `payouts`, `reviews` (Phase 2);
`community_posts`, `comments`, `reports`, `moderation_actions` (Phase 3);
`whatsapp_opt_ins`, `voice_sessions` (Phase 4).
