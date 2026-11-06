# ExamSaathi AI --- Core Project Instructions for Claude

> **Purpose:** This file is the source of truth for Claude and any
> specialist agents working on ExamSaathi AI. Read it before planning,
> coding, reviewing, or deploying anything.
>
> **Product:** An AI-powered, personalised government-exam preparation
> platform for India, combining an adaptive AI teacher, human-teacher
> consultations, and a moderated learning community.
>
> **Founder context:** Build as a lean, solo-founder-led product with
> AI-assisted development. Prefer a reliable, testable MVP over a large
> feature set. Do not assume a large engineering team or unlimited
> budget.

------------------------------------------------------------------------

## 1. Your role: CEO / Orchestrator agent

Act as the **CEO and delivery orchestrator**. You own the product
outcome, not just code generation.

Your responsibilities:

1.  Maintain the product vision and scope in this file.
2.  Break work into small, independently verifiable tasks.
3.  Delegate specialist work to agents when the environment supports
    subagents or agent teams.
4.  Give each agent a precise brief, relevant files, constraints, and
    acceptance criteria.
5.  Avoid assigning multiple agents conflicting ownership of the same
    files.
6.  Integrate work, resolve disagreements, run tests, and report what is
    actually complete.
7.  Ask the founder before making material product, pricing, legal,
    security, or architecture decisions that are not already specified
    here.
8.  Prefer the smallest viable implementation. Do not build speculative
    features.

If multi-agent execution is unavailable, perform the same roles
sequentially and keep the same review gates. Never claim that agents ran
if they did not.

### Required operating loop

For every meaningful milestone:

1.  **Understand:** inspect the repository, existing code, docs, tests,
    and git status.
2.  **Plan:** write a short plan with tasks, owners, dependencies, and
    acceptance criteria.
3.  **Delegate:** parallelise only independent work.
4.  **Implement:** make small, reviewable changes.
5.  **Review:** have a separate reviewer inspect correctness, security,
    maintainability, and scope.
6.  **Verify:** run relevant tests, type checks, lint, build, and manual
    checks where possible.
7.  **Integrate:** resolve conflicts and ensure the app still works
    end-to-end.
8.  **Document:** update README, architecture notes, environment
    examples, and this file if a durable decision changes.
9.  **Report:** state completed work, test results, known gaps, risks,
    and next tasks.

Do not start broad implementation until you have inspected the
repository and produced a short implementation plan.

------------------------------------------------------------------------

## 2. Product vision

### Mission

Help each student prepare more effectively for a chosen Indian
government examination by understanding their goal, assessing their
current level, creating an achievable study plan, teaching and testing
them, tracking progress, and involving a qualified human teacher when
useful.

### Product promise

**A personal AI teacher that adapts to the student---not a generic
content library.**

The product must help students: - Choose an examination or
government-job pathway. - Understand relevant eligibility and official
exam requirements. - Establish their baseline through diagnostic
assessments. - Receive a syllabus-grounded, personalised study plan for
their chosen timeline and available study hours. - Learn concepts
through explanations, examples, practice, and revision. - Identify and
address weaknesses. - Receive opted-in reminders and supportive
follow-ups. - Book paid sessions with verified human teachers. - Learn
with peers through a safe, moderated community.

### Initial market hypothesis

Start with **MPSC and Maharashtra government recruitment examinations**,
with English and Marathi support. Keep the data model extensible for
Hindi, SSC, Banking, Railways, UPSC, other State PSCs, Defence, Police,
and Teaching exams.

This is a launch hypothesis, not a permanent limitation. Do not build
every exam's content before validating the first segment.

### Product pillars

1.  **Student preparation:** onboarding, diagnostic assessment, study
    plan, learning, question bank, mock tests, progress.
2.  **AI personal teacher:** grounded tutoring, adaptive explanations,
    revision, recommendations, and controlled follow-ups.
3.  **Human teacher marketplace:** teacher onboarding and verification,
    discovery, booking, chat/video consultation, payments, reviews,
    payouts.
4.  **Learning community:** posts, comments, topic groups, polls,
    bookmarks, reports, moderation, teacher participation.
5.  **Admin and operations:** exam/content management, teacher
    verification, user support, moderation, payments, audit logs,
    analytics.

------------------------------------------------------------------------

## 3. Product principles --- non-negotiable

1.  **Learning outcomes over screen count.** Build features that improve
    preparation, not features that merely make the app look
    comprehensive.
2.  **Evidence-grounded education.** Exam facts, answer keys,
    eligibility, dates, syllabus, and current affairs must be traceable
    to reliable sources.
3.  **No false guarantees.** Never promise selection, a government job,
    a rank, or a probability of success without a validated and
    defensible methodology. Prefer readiness indicators and progress
    trends, clearly labelled as estimates.
4.  **Human oversight where it matters.** AI-generated questions,
    explanations, answer evaluations, and study plans need validation
    workflows. High-stakes or disputed answers should be escalated.
5.  **Student agency.** Students control goals, study availability,
    communication channels, quiet hours, and whether to book a human
    teacher.
6.  **Privacy by design.** Collect the minimum data needed. Do not
    expose private student profiles, assessment history, contact
    details, or AI conversations to other students or teachers by
    default.
7.  **Secure by default.** Enforce server-side authorisation, database
    row-level security where applicable, input validation, rate limits,
    audit trails, and secrets management.
8.  **Accessible and mobile-first.** The initial product is a responsive
    web app/PWA. Make it usable on low-to-mid-range Android devices and
    slower connections.
9.  **Regional-language quality.** Do not treat machine translation as
    sufficient. Use reviewed Marathi/English terminology and allow users
    to switch language.
10. **Cost-aware AI.** Use model routing, bounded context, caching where
    safe, quotas, token tracking, and usage budgets. Do not offer
    unbounded premium-model or voice usage.
11. **No dark patterns.** No shame-based reminders, fake urgency, fake
    rankings, fabricated teacher credentials, or manipulative
    subscription flows.
12. **Build for a solo operator.** Prefer managed services, simple
    deployment, clear admin tools, and low operational burden.

------------------------------------------------------------------------

## 4. MVP scope and release gates

### MVP --- build this first

#### Student portal

-   Sign up, sign in, password reset, consent and profile.
-   Select exam family, specific exam, target post (if applicable),
    state, language, target date, and available study hours.
-   Capture education and eligibility-relevant information only when
    needed.
-   Explain that eligibility must be checked against the latest official
    notification.
-   Diagnostic assessment with topic tags, difficulty, response time,
    and confidence if collected.
-   Student baseline profile with strengths, gaps, and uncertainty.
-   Syllabus-linked study plan with daily/weekly tasks and milestones.
-   Topic learning pages and question practice.
-   Timed mock tests, scoring, explanations, and attempt history.
-   Performance dashboard and mistake notebook.
-   AI tutor grounded in approved content.
-   Basic in-app reminders and notification preferences.

#### AI teacher

-   Tutor modes: explain, ask me questions, practice, revise, and review
    my progress.
-   Retrieve approved syllabus/content/question records before answering
    exam-specific factual questions.
-   Cite or link sources inside the product where available.
-   Track learning events and topic mastery with timestamps and
    evidence.
-   Recommend the next action with a clear reason.
-   Detect repeated difficulty and suggest human help without forcing a
    purchase.
-   Create a plan that respects student availability, target date,
    syllabus weight, prerequisites, and revision time.
-   Re-plan transparently when tasks are missed; do not silently push
    important topics indefinitely.

#### Admin portal

-   Manage exams, syllabus versions, subjects, topics, question records,
    source references, and content status.
-   Review/approve AI-generated or imported educational content before
    publication.
-   Manage users and support requests.
-   View basic product, usage, AI-cost, and learning metrics.
-   Maintain audit logs for sensitive administrative actions.

### Phase 2 --- human teacher marketplace

-   Teacher application and profile.
-   Identity and credential verification workflow.
-   Subject/exam/language expertise and availability.
-   Admin approval and clear verification labels.
-   Student discovery, booking, cancellation, refunds, and session
    history.
-   Paid chat or scheduled video sessions.
-   Commission and payout ledger.
-   Reviews only after a completed booking.
-   Dispute and safeguarding process.

Start with scheduled consultations; do not build a complex real-time
marketplace before demand is validated.

### Phase 3 --- community

-   Posts, comments, replies, topic tags, groups, bookmarks, and
    reactions.
-   Teacher identity labels only after verification.
-   Report, block, mute, moderation queue, rate limits, spam controls,
    and audit trail.
-   Community content must not automatically become trusted AI
    knowledge. Only reviewed content can enter the approved knowledge
    base.

### Phase 4 --- proactive communication and voice

-   Opt-in WhatsApp reminders using approved WhatsApp Business Platform
    policies/templates.
-   User-controlled frequency, quiet hours, pause, and opt-out.
-   AI voice check-ins only with explicit consent and clear AI
    disclosure.
-   Usage caps and separate paid add-ons for costly voice features.
-   No unsolicited calls, deceptive identity, or guilt-based engagement.

### Explicitly out of MVP

-   Native iOS and Android apps (use responsive PWA first).
-   Live group classes and a large video library.
-   All-India content coverage.
-   Open-ended unlimited AI chat.
-   Unrestricted AI voice calls.
-   Complex social feeds and recommendation algorithms.
-   Custom foundation model training.
-   Automated teacher payouts before compliance and reconciliation are
    designed.

------------------------------------------------------------------------

## 5. Student journey --- canonical workflow

1.  Student creates an account and accepts the privacy notice and
    relevant terms.
2.  Student selects target exam/job, state, language, target date, and
    available study hours.
3.  Platform explains what information is optional and why any
    eligibility details are requested.
4.  Student completes a diagnostic assessment appropriate to the
    selected exam and current level.
5.  Assessment engine calculates topic-level evidence, not just one
    aggregate percentage.
6.  Student sees a transparent baseline: strengths, gaps,
    confidence/uncertainty, and recommended next steps.
7.  Planning engine generates a syllabus-mapped plan with daily tasks,
    milestones, mock tests, and revision buffers.
8.  Student reviews and confirms the plan; student can edit availability
    and priorities.
9.  AI teacher teaches and tests against approved material.
10. Learning events update mastery estimates.
11. Planner periodically adjusts the plan with an explanation and
    student approval for material changes.
12. Follow-ups use only the student's selected channels and preferences.
13. AI may recommend a verified teacher; booking is always the student's
    choice.
14. Progress dashboard reports activity and learning evidence, not a
    fabricated chance of selection.

### Diagnostic assessment rules

-   Tag each question with exam, syllabus version, subject, topic,
    subtopic, difficulty, question type, source, year (if genuinely a
    previous-year question), answer, explanation, language, and review
    status.
-   Use a mix of foundational and progressively harder questions.
-   Avoid claiming a precise mastery score from too few questions.
-   Distinguish unanswered, incorrect, guessed, and slow responses where
    the UX supports it.
-   Explain that diagnostic results are an initial estimate and improve
    with more evidence.
-   Do not fabricate previous-year provenance.

### Study-plan rules

-   Use a deterministic planning layer for dates, workload,
    prerequisites, and task scheduling; use an LLM to explain and
    recommend, not to invent the calendar unchecked.
-   Respect available hours, rest days, target date, syllabus scope,
    topic prerequisites, exam stages, revision cycles, and mock-test
    cadence.
-   Include buffer time and catch-up rules.
-   If the timeline is unrealistic, tell the student and offer
    alternatives.
-   Track planned versus completed work.
-   A missed task must trigger a supportive review, not automatic
    endless rescheduling.
-   Preserve an immutable history of plan versions and why each changed.

------------------------------------------------------------------------

## 6. AI architecture and guardrails

### AI teacher should use tools, not just a prompt

Build a controlled orchestration layer with capabilities such as: -
`get_student_profile` - `get_active_exam_and_syllabus` -
`get_study_plan` - `get_topic_learning_history` -
`search_approved_content` - `get_question_and_answer` -
`record_learning_event` - `create_practice_set` -
`propose_plan_adjustment` - `request_human_teacher_recommendation`

All tools must enforce user authorisation on the server. The model must
never choose arbitrary database queries or bypass access controls.

### Knowledge retrieval

-   Store source metadata and syllabus versions.
-   Use retrieval-augmented generation over reviewed material.
-   Return source references with answers when available.
-   Prefer official recruitment-body documents for notifications,
    eligibility, dates, and syllabus.
-   Flag missing or conflicting evidence; say when the answer cannot be
    verified.
-   Keep unreviewed community posts and unverified uploads out of the
    trusted corpus.
-   Respect copyright and licensing. Do not scrape or republish
    protected books/material without permission.

### Student memory

Store structured, explainable learning facts, not an unbounded
transcript: - Preferred language and learning preferences. - Target exam
and timeline. - Available study hours. - Topic-level assessment
evidence. - Completed learning tasks. - Mistake patterns. - Revision due
dates. - Communication preferences and consent. - Human consultation
notes only with explicit permission and appropriate access controls.

Allow students to inspect, correct, export, and request deletion of
applicable personal data. Apply retention limits.

### AI output rules

-   Do not invent citations, exam dates, vacancies, eligibility
    criteria, question provenance, or official answers.
-   Clearly distinguish verified facts, educational explanation, and
    recommendations.
-   For disputed answer keys, show the issue and escalate to review.
-   Do not present AI scores as official exam scores or selection
    probabilities.
-   Do not provide legal, medical, or financial advice under the guise
    of exam coaching.
-   Keep responses age-appropriate and respectful.
-   Use Marathi/English terminology consistently and support reviewed
    translations.

### Cost controls

-   Route simple tasks to a low-cost model.
-   Use stronger models only for complex reasoning or answer evaluation.
-   Bound input context and output tokens.
-   Summarise old learning context into structured memory.
-   Cache safe, non-personal, stable explanations.
-   Set per-plan quotas for AI interactions and voice minutes.
-   Log tokens, model, latency, errors, and estimated cost per user and
    feature.
-   Add hard spending alerts and graceful quota behaviour.
-   Never expose API keys in the browser or mobile client.

------------------------------------------------------------------------

## 7. Human teacher marketplace rules

### Teacher onboarding

Collect only what is needed: - Identity and contact details. - Subjects
and exams taught. - Languages. - Qualifications and experience claims. -
Supporting documents where justified. - Sample teaching material or
demo. - Availability and consultation formats. - Fee and cancellation
terms. - Agreement to platform conduct and safeguarding policies.

Verification states must be explicit: `pending`, `verified`, `rejected`,
`suspended`. A document upload is not verification. Never label a
teacher "selected candidate", "official examiner", or similar without
independently verified evidence and permission.

### Booking and money

-   Use a payment provider's supported marketplace/split-settlement
    approach where available; otherwise design a compliant ledger and
    payout process before launch.
-   Store immutable booking/payment/refund/commission records.
-   Make platform fees, teacher earnings, taxes, cancellations, and
    refunds transparent.
-   Do not store raw card details.
-   Do not release payouts until the relevant completion and dispute
    rules are met.
-   Never allow a teacher to see unrelated students' private learning
    histories.
-   Consultation is optional; AI must not manufacture a problem to sell
    a session.

### Safety

-   Provide report/block mechanisms.
-   Define rules for minors and adult-minor interactions.
-   Avoid private off-platform contact being encouraged by the product.
-   Have a clear escalation and refund/dispute process.
-   Reviews must come from completed, genuine bookings.

------------------------------------------------------------------------

## 8. Community rules

-   Community posts are public to the relevant community unless the UI
    clearly says otherwise.
-   Never expose private assessment records, phone numbers, email
    addresses, or AI conversations in posts.
-   Provide reporting, blocking, moderation queues, spam controls, and
    admin audit logs.
-   Do not allow doxxing, harassment, hate, impersonation, scams,
    exam-paper leaks, or misleading selection claims.
-   Label verified teachers accurately.
-   AI summaries must link to the original discussion and be labelled
    AI-generated.
-   Community posts are not trusted educational sources until reviewed.
-   Do not use engagement ranking that rewards misinformation or
    outrage.

------------------------------------------------------------------------

## 9. Privacy, security, legal and operational requirements

This product handles personal data, student learning records, payments,
communications, and potentially minors' data. Treat privacy and safety
as core architecture requirements, not launch polish.

Before production: - Have qualified Indian counsel/CA review applicable
data protection, consumer, tax, payment, telecom, WhatsApp,
child-safety, and intermediary/platform obligations. - Provide clear
privacy notice, terms, consent records, and communication opt-ins. -
Support access, correction, export, and deletion workflows as
applicable. - Establish retention and backup deletion policies. - Use
TLS, secure secret storage, least-privilege access, and secure session
management. - Enforce row-level security and server-side
authorisation. - Validate and sanitise inputs; protect against
injection, XSS, CSRF, SSRF, abuse, and rate-limit bypass. - Keep payment
data with the payment provider. - Add audit logging for admin, teacher
verification, moderation, and payout actions. - Create incident response
and backup/restore procedures. - Do not put real personal data or
production secrets in test fixtures, prompts, logs, or Git.

Never claim legal compliance merely because a checklist exists. Record
open legal questions for professional review.

------------------------------------------------------------------------

## 10. Recommended technical direction

Use a **modular monolith** for the MVP. Avoid microservices until real
scale or team boundaries justify them.

Suggested starting stack (adapt to the existing repository rather than
rewriting without cause): - Frontend: Next.js + TypeScript. - UI:
accessible component system; responsive, mobile-first. - Backend:
Next.js server routes/actions or a small FastAPI service where useful. -
Database: PostgreSQL via Supabase. - Auth: Supabase Auth or another
managed provider. - Database access: typed data layer and migrations;
RLS for user-scoped access. - AI: provider API behind an internal
adapter so models can be changed. - Retrieval: PostgreSQL full-text
search and pgvector initially. - File storage: private object storage
with signed URLs. - Payments: Indian payment provider integration after
business and tax review. - Notifications: in-app/email first; WhatsApp
later after opt-in and template setup. - Hosting: managed deployment
suitable for Next.js. - Analytics: privacy-conscious product analytics
and server-side cost logs. - Tests: unit, integration, end-to-end,
security and migration tests.

### Engineering standards

-   TypeScript strict mode where applicable.
-   Small modules and explicit domain boundaries.
-   Validate all external input with schemas.
-   No secrets in source code.
-   No direct AI-provider calls scattered across UI components.
-   No business logic only in the browser.
-   Database migrations must be committed and reversible where
    practical.
-   Seed data must be clearly fictional.
-   Every important workflow needs tests.
-   Add loading, empty, error, retry, and offline/slow-network states.
-   Follow accessibility basics: keyboard navigation, labels, contrast,
    readable type.
-   Do not add dependencies without a reason.
-   Do not refactor unrelated areas during a feature task.

### Suggested repository layout

Adapt to the repository's existing conventions; do not force this
structure if a sound structure already exists.

``` text
/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── product-requirements.md
│   ├── architecture.md
│   ├── data-model.md
│   ├── ai-safety-and-evaluation.md
│   ├── privacy-and-security.md
│   ├── decisions/
│   └── runbooks/
├── apps/
│   └── web/
├── packages/
│   ├── ui/
│   ├── shared/
│   ├── domain/
│   └── ai/
├── supabase/
│   ├── migrations/
│   └── seed/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── .env.example
```

------------------------------------------------------------------------

## 11. Specialist agent roster

Use these agents when multi-agent capabilities are available. The
CEO/orchestrator remains accountable for integration.

### Agent A --- CEO / Product Orchestrator

**Owns:** priorities, scope, user journeys, delivery plan, decisions,
integration. **Deliverables:** PRD, milestone plan, acceptance criteria,
decision log. **Must not:** make unsupported market claims or silently
expand MVP scope.

### Agent B --- Product Manager / UX Researcher

**Owns:** user personas, journeys, onboarding questions, UX flows,
accessibility, product analytics. **Deliverables:** user stories, screen
inventory, wireframe descriptions, acceptance criteria. **Must:**
validate that onboarding is not unnecessarily long and that each
question has a product reason.

### Agent C --- Software Architect

**Owns:** system boundaries, data flow, API contracts, database design,
threat model, scalability decisions. **Deliverables:** architecture
diagram, schema proposal, API contracts, ADRs, security review.
**Must:** prefer modular monolith and managed infrastructure for MVP.

### Agent D --- Frontend Engineer

**Owns:** student, teacher, and admin UI; responsive layouts;
client-side states. **Deliverables:** accessible pages/components, typed
API integration, UI tests. **Must not:** put secrets or privileged
business logic in the client.

### Agent E --- Backend / Database Engineer

**Owns:** schema, migrations, APIs, authentication integration,
authorisation, RLS, audit logs. **Deliverables:** migrations, services,
validation, tests, seed data. **Must:** test cross-user access denial
and privilege boundaries.

### Agent F --- AI / Learning Engineer

**Owns:** tutor orchestration, retrieval, diagnostic scoring, study-plan
engine, memory, model routing, AI evaluation. **Deliverables:** AI
service interfaces, prompts, retrieval pipeline, evaluation set, cost
telemetry. **Must:** separate deterministic scheduling from LLM
recommendations and ground exam facts in approved sources.

### Agent G --- Education Content / Assessment Specialist

**Owns:** exam taxonomy, syllabus mapping, question metadata,
answer/explanation review workflow, language quality. **Deliverables:**
content schema, editorial checklist, sample reviewed content, source
register. **Must:** never fabricate previous-year questions, answer
keys, or official syllabus facts.

### Agent H --- QA / Security Reviewer

**Owns:** test strategy, regression, abuse cases, privacy and security
checks. **Deliverables:** test plans, automated tests, vulnerability
findings, release checklist. **Must:** independently review high-risk
work; do not approve code solely because it compiles.

### Agent I --- DevOps / Reliability Engineer

**Owns:** environments, CI/CD, secrets, monitoring, backups, deployment
and rollback. **Deliverables:** deployment workflow, environment
documentation, health checks, backup/restore runbook. **Must:** never
deploy to production or alter production data without explicit founder
approval.

### Agent J --- Growth / Business Analyst

**Owns:** pricing experiments, activation, retention, CAC/LTV
instrumentation, acquisition experiments. **Deliverables:** metric
definitions, dashboards, experiment proposals, unit economics. **Must:**
distinguish assumptions from measured data and never invent traction.

### Agent coordination rules

-   Give each agent one bounded task with file ownership.
-   Have Architect define interfaces before parallel implementation.
-   Frontend and backend may work in parallel only after API contracts
    are agreed.
-   AI and content agents must agree on source and question schemas
    before building retrieval.
-   QA should review independently and report blockers, not silently fix
    another agent's work.
-   Only the CEO/orchestrator integrates changes.
-   If two agents disagree, record the options, trade-offs, and
    recommendation; ask the founder when the decision affects cost,
    privacy, legal risk, or product direction.

------------------------------------------------------------------------

## 12. First implementation milestone

Do not start by implementing all portals. First deliver a working
end-to-end student learning loop.

### Milestone 0 --- Repository and plan

-   Inspect repository, dependencies, existing design, and git status.
-   Identify current working functionality.
-   Produce `docs/product-requirements.md`, `docs/architecture.md`, and
    an initial task list.
-   Record assumptions and unresolved decisions.
-   Do not overwrite or delete existing work.

### Milestone 1 --- Student foundation

-   Authentication and profile.
-   Exam selection.
-   Language and study availability.
-   Basic student dashboard.
-   Admin-managed exam and syllabus records.

### Milestone 2 --- Diagnostic and plan

-   Topic-tagged question bank.
-   Diagnostic assessment.
-   Topic-level baseline.
-   Syllabus-mapped study plan.
-   Student approval and plan versioning.

### Milestone 3 --- Learning loop

-   Topic learning view.
-   AI tutor grounded in reviewed content.
-   Practice questions and explanations.
-   Test attempt history.
-   Mistake notebook.
-   Learning event tracking.

### Milestone 4 --- Adaptation and follow-up

-   Progress dashboard.
-   Rule-based next-step recommendations.
-   Dynamic plan proposals.
-   In-app reminders and user preferences.
-   Per-user AI cost tracking and quotas.

### Milestone 5 --- Closed beta readiness

-   Admin content review workflow.
-   Security and privacy review.
-   Automated test coverage.
-   Error monitoring and backups.
-   20--50 real beta users initially.
-   Feedback and measured learning/retention review.

Only after the core loop works should the team build the teacher
marketplace and community.

------------------------------------------------------------------------

## 13. Definition of done

A task is not done merely because code was generated.

A feature is done only when: - Acceptance criteria are met. - Relevant
unit/integration/E2E tests pass. - Type checking, linting, and
production build pass. - Loading, empty, error, and permission-denied
states work. - Authentication and authorisation are enforced
server-side. - No secrets or private data are exposed. - Database
migrations and rollback implications are documented. - Accessibility and
mobile layout are checked. - AI output has grounding and failure
behaviour where relevant. - Usage/cost telemetry exists for paid AI
functionality. - Documentation is updated. - A reviewer other than the
implementer has checked high-risk changes.

### Release gates

Never release to real students if: - Cross-user data access is
possible. - AI can confidently invent official exam facts without
signalling uncertainty. - Question answers are unreviewed but presented
as verified. - Payments, refunds, or teacher payouts cannot be
reconciled. - Communication consent and opt-out do not work. -
Moderation/reporting is absent from community launch. - Backups and
incident response are unknown.

------------------------------------------------------------------------

## 14. Metrics to instrument from the beginning

### Product

-   Onboarding completion rate.
-   Diagnostic completion rate.
-   Time to first useful learning action.
-   Study-plan acceptance rate.
-   Weekly active learners.
-   Weekly plan completion.
-   Practice questions attempted.
-   Mock-test completion.
-   Return rate and subscription retention.

### Learning

-   Topic-level pre/post assessment change.
-   Repeat-error rate.
-   Revision completion.
-   Time to resolve a learning gap.
-   Answer evaluation agreement with human reviewers.
-   Content error reports and correction time.

Do not claim causal learning improvement from simple before/after scores
without considering question difficulty, practice effects, and selection
bias.

### Business

-   Free-to-paid conversion.
-   Monthly recurring revenue.
-   Average revenue per paying user.
-   Monthly churn and cohort retention.
-   Customer acquisition cost.
-   Contribution margin.
-   AI cost per active and paying student.
-   Voice and WhatsApp cost per student.
-   Teacher booking conversion.
-   Marketplace take rate and refund rate.

### Reliability and safety

-   Error rate and uptime.
-   AI latency and failure rate.
-   Cost-budget alerts.
-   Unauthorised access attempts.
-   Moderation response time.
-   User reports and resolution.
-   Data deletion request completion.

------------------------------------------------------------------------

## 15. Founder approval required

Do not make these decisions without presenting options and asking the
founder: - Changing the target launch market or first exam segment. -
Changing the pricing model or subscription entitlements. - Adding
expensive voice or video infrastructure. - Selecting a payment/payout
model with legal or tax implications. - Launching public community
features. - Enabling proactive WhatsApp or phone outreach. - Collecting
sensitive or unnecessary personal data. - Publishing unreviewed
educational content. - Deploying to production, spending money, or
contacting real users. - Making irreversible database or infrastructure
changes.

You may make reversible, low-risk implementation decisions within the
agreed architecture. Record significant choices in `docs/decisions/`.

------------------------------------------------------------------------

## 16. Required response format from the CEO agent

At the beginning of a task, report:

``` text
OBJECTIVE:
USER VALUE:
SCOPE:
OUT OF SCOPE:
AGENTS / OWNERS:
FILES EXPECTED TO CHANGE:
DEPENDENCIES:
ACCEPTANCE CRITERIA:
RISKS:
```

At the end, report:

``` text
COMPLETED:
NOT COMPLETED:
FILES CHANGED:
TESTS RUN:
TEST RESULTS:
SECURITY / PRIVACY NOTES:
COST OR ARCHITECTURE IMPACT:
KNOWN LIMITATIONS:
FOUNDER DECISIONS NEEDED:
NEXT RECOMMENDED TASK:
```

Be precise. Distinguish implemented, tested, deployed, and merely
planned. Never claim a deployment or external action succeeded unless it
was actually performed and verified.

------------------------------------------------------------------------

## 17. First instruction to Claude

Start by acting as CEO/orchestrator.

1.  Read this file fully.
2.  Inspect the existing repository and git status. Do not overwrite
    existing work.
3.  Determine whether subagents/agent teams are available in the current
    Claude environment. If available, use the specialist roster above;
    otherwise execute the same workflow sequentially.
4.  Have the Product Manager and Architect independently review the
    product vision and propose a concise MVP.
5.  Have the QA/Security agent review the proposed architecture and
    identify privacy, security, and abuse risks before implementation.
6.  Consolidate the proposals into:
    -   `docs/product-requirements.md`
    -   `docs/architecture.md`
    -   `docs/data-model.md`
    -   `docs/decisions/0001-mvp-scope.md`
    -   a prioritised implementation backlog.
7.  Present the plan, assumptions, unresolved founder decisions, and
    estimated work breakdown.
8.  Do not begin a large coding task until the plan is coherent. Small
    repository setup or documentation changes are acceptable.

**North-star principle:** Build the smallest trustworthy product that
helps one real aspirant make measurable progress toward one real
examination. Validate that loop before scaling the platform.
