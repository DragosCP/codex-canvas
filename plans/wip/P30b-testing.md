# P30b Testing - Rust Verification And Desktop Dogfood

## Status

- Active testing plan.
- Goal: verify P30b after Phase 9 with Rust/protocol tests and one real desktop dogfood project using two intentionally created chats, five prompts per chat, DOM checks, screenshots, and thread-count/streaming checks.

## Scope

- Verify Rust changes introduced around `turn/start.planningOnly`, planning-only permissions, and follow-up callsites that send `TurnStartParams`.
- Dogfood in `C:\Users\drago\Desktop\ExYZ`.
- Create exactly two primary chats intentionally for the dogfood: one single-option flow and one three-option flow.
- Watch for accidental new chat/thread creation after each prompt, response, questionnaire, or stream transition.
- Inspect agent decision logic rather than hardcoding expected behavior: if the user names a lane, the agent should use that lane; if the user asks for options, the agent should offer A/B/C-style alternatives; if Live exists, it should prefer modifying a copied/live-derived proposal instead of inventing unnecessary scaffolding.

## Rust Verification

- Run protocol tests for the app-server v2 shape.
- Run app-server tests covering planning-only turn behavior.
- Run scoped Rust tests for the two callsites fixed after Electron sidecar build:
  - `codex-exec`
  - `codex-tui`
- Run focused desktop tests again if Rust or protocol fixes alter desktop behavior.

## Desktop Dogfood Matrix

Use Electron DOM plus screenshots at each step. Check Canvas header contract remains unchanged.

### Chat 1 - Single Option

1. Prompt: create a mobile-first task board app with To do / In progress / Done, colored categories, board/list toggle, editable tasks, drag/drop movement, glassmorphism, rounded corners. Ask for one option to build.
2. Prompt: `Let's move this (see mark1)`. Before Live exists, verify whether the agent works on the existing proposal lane and does not create a stray thread.
3. Prompt: propose a settings button. Verify whether it lands in Live/A/B/C, inspect `Changes`/`Mark 1`/`Change 1`, drag the proposed change mark to a different location, and confirm the composer chip appears with hidden context.
4. Vague prompt that still specifies a lane, such as `Implement in A an option to view archived tasks`. Verify the agent does not ask which lane when the lane was specified.
5. Vague follow-up after Live exists. Verify it prefers a Live-derived proposal/update unless the user asks for multiple options.

### Chat 2 - Three Options

1. Prompt: same task board app, but ask for three options to build.
2. Prompt: `I don't like this, find me a better option` on a selected A/B/C lane. Verify the update stays within proposal lanes and does not create Live prematurely.
3. Prompt: move a button from X to Y and add a filter next to it. Inspect above-composer options, streaming continuity, marks, and changed-location accuracy.
4. Prompt: `Implement in B an option to view archived tasks`. Verify the agent understands B, handles busy/outdated state through resolver/recovery, and does not ask for A/B/C unnecessarily.
5. Prompt: `Give me 2-3 options to view archived tasks`. Verify the agent understands options are requested and uses above-composer/proposal logic appropriately.

## Failure Policy

- If behavior looks wrong, inspect for duplicated code before fixing.
- Prefer deleting or consolidating duplicated paths over patching around them.
- If the agent decision looks suspect rather than the product code, switch the tested agent to GPT 5.5 with xHigh reasoning before continuing verification.
- Fix issues on the go, then continue to the next close functionality before concluding root cause.

## Evidence

- Capture screenshots under an artifact folder for each prompt step.
- Record thread ids/counts before and after each prompt.
- Record DOM facts for Canvas lanes, proposal row buttons, marks/chips, and visible questionnaire choices.
- Final report should state exactly what passed, what failed and was fixed, and what remains unverified.
