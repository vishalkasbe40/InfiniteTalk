# ADR 0002 — Repurpose this repository for ExamSaathi AI

- Status: **Accepted** (founder instruction, 2026-11-03)
- Date: 2026-11-03

## Context
This repository started as a fork of MeiGen-AI's **InfiniteTalk** (audio-driven talking-video
generation, Python/PyTorch, Apache-2.0). It contains no ExamSaathi code. The founder chose to
use this repository for ExamSaathi AI instead of creating a new one.

## Decision
- All InfiniteTalk files move unchanged to `legacy/infinitetalk/` (with `git mv`, so history is preserved).
  Its `LICENSE.txt` (Apache-2.0) stays with that code and continues to apply to it.
- The repository root now belongs to ExamSaathi AI (`CLAUDE.md`, `docs/`, and later `apps/`, `packages/`, `supabase/`).
- No ExamSaathi code depends on legacy code. Any future reuse (e.g. avatar video) needs a new ADR,
  a licence check of the model weights and dependencies, and founder approval (expensive video infra, `CLAUDE.md` §15).

## Consequences
- The GitHub repo name (`InfiniteTalk`) and fork relationship are misleading. **Recommended:** rename the
  repository and/or detach the fork in GitHub settings (founder action), or later move `legacy/` out entirely.
- The legacy folder adds about 24 MB of assets to clones. It can be removed in a future commit once the founder confirms it isn't needed.
