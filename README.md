# ExamSaathi AI

A personalised preparation platform for Indian government exams. It combines a diagnostic assessment,
a realistic syllabus-mapped study plan, and an AI teacher grounded in reviewed content. The first
target is MPSC (Maharashtra), with English and Marathi.

> **Status:** Milestone 0 (planning). There is no application code yet.

## Start here
| Doc | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Vision, principles, guardrails, agent roster, definition of done (source of truth) |
| [`docs/product-requirements.md`](docs/product-requirements.md) | MVP scope, user journey, acceptance criteria, assumptions |
| [`docs/architecture.md`](docs/architecture.md) | System shape, modules, planner/mastery/tutor design, security model |
| [`docs/data-model.md`](docs/data-model.md) | Tables, RLS rules, integrity rules |
| [`docs/backlog.md`](docs/backlog.md) | Prioritised milestones and tasks |
| [`docs/decisions/`](docs/decisions/) | Architecture decision records |

## Planned stack
Next.js + TypeScript (strict), Supabase (Postgres, Auth, RLS, pgvector), pnpm workspaces,
Vitest, Playwright, pgTAP. See `docs/architecture.md`.

## Legacy code
This repository was previously a fork of InfiniteTalk (talking-video generation). That code
lives unchanged under [`legacy/infinitetalk/`](legacy/infinitetalk/) under its original Apache-2.0
licence. ExamSaathi does not use it. See [ADR 0002](docs/decisions/0002-repository-takeover.md).

## Licence
The licence for the ExamSaathi code is not yet decided (ADR 0001, D9). Until then, all rights are reserved.
