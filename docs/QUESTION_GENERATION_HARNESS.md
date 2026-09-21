# Question Generation Harness

`QuestionRun v0.1` is the first safe execution slice for the V2 question
pipeline. It lives beside the legacy generation orchestrator; it does not route
production requests through the new path yet.

The harness uses the maintained LangGraph line and therefore raises the project
runtime floor from Node.js 18 (end-of-life) to Node.js 20.

## Boundary

The canonical `QuestionRun` record is plain, JSON-safe TypeScript and does not
depend on LangGraph. LangGraph only executes the stages:

1. plan a `QuestionBlueprint`;
2. validate the blueprint;
3. solve the physics and render student-facing visuals;
4. author a question-package artifact;
5. validate question, answer, source, and visual agreement;
6. assess novelty;
7. prepare a human-review envelope.

Each stage records attempts, checks, timestamps, and rejection reasons. Retry
limits are explicit and capped at five. A retryable failure that exhausts its
budget becomes `retry-budget-exhausted`; a non-retryable failure stops the graph
immediately.

## Acceptance policy

Automated stages may pass, flag, skip, retry, or reject. They cannot accept.
Agent review decisions are restricted to `pass`, `flag`, or `reject`. A
successful graph run stops at `awaiting-human-review`. Version 0.1 deliberately
exports no acceptance function: promotion will require a later authenticated,
persistent human-review service boundary.

Human acceptance still does not make a package training-ready. Source-use
rights, training metadata, and grouped split assignment remain independent
blockers.

## Current deterministic replay

The v0.1 adapters make no model calls. They replay one checked circuit package
and one checked field package by rerunning their deterministic solver,
rerendering their SVG, and invoking the existing package validator. Novelty is
recorded as `not-run` because source replay tests execution integrity rather
than originality. Independent agent review is likewise recorded as `not-run`.

This slice proves the orchestration and audit contract before live planner,
author, novelty-ledger, Gemini-review, persistence, or batch-generation
adapters are added.
