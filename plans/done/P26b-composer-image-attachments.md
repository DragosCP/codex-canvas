# P26b - Composer Image Attachments

## Status

Done.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`

## Goal

Let a user drag local pictures into Codex Local chat, see compact removable image chips inside the composer, and send those pictures through the native Codex image-input path without changing unrelated UI.

Follow-up scope: App Preview/Mockup Preview user marks and agent `Changes` marks should use the same visual chip and fullscreen-preview treatment in the composer and chat transcript, without changing the locked Canvas v2 preview header.

## User Workflow Contract

- Dragging one or more supported image files onto the composer adds thumbnail chips above the text box.
- Each chip can be removed before sending.
- Clicking an image chip previews it fullscreen over a dimmed/blurred app shell, with a close button.
- Send is allowed when the draft has text, visual context chips, or attached images.
- Unsupported files are shown as unsupported and block Send until removed.
- The sent turn carries images as native local image inputs, not as copied file text or visible prompt boilerplate.
- After Send, the chat transcript shows the sent pictures as compact thumbnails above the user message.
- Drawing a user mark in App Preview or Mockup Preview creates a named picture chip such as `Mark 1` / `Area A mark 1`, not a text-only coordinate pill.
- Attaching an agent change mark from `Changes` creates the same picture-chip shape, while preserving the hidden rectangle metadata for Codex.
- Sent mark chips stay visible above the user message and open in the same fullscreen preview as normal image attachments.
- Sent mark chips clear from the composer after Send; if a later decision choice needs the same visual context, that choice may reattach the saved sent context instead of leaving the original chip stuck as unsent state.
- Saved mockup review follow-ups such as `add Option C based on B` should update/create that saved option directly and must not surface a generic decision strip for an already-scoped mockup revision.
- This plan must not alter Canvas v2 header button labels, order, grouping, or visibility.

## Findings

- The desktop app already has composer attachment state, drag/drop handling, image chips, file-picker fallback, image preview loading, and lightbox preview.
- Electron already exposes `webUtils.getPathForFile` and a `read_image_data_url` helper for dropped image files.
- The app-server protocol already supports `UserInput::LocalImage`, and core converts local images to model image content during request serialization.
- The remaining gap is send readiness: attachment-only drafts were not counted as sendable content.
- Follow-up note: sent images were initially rendered as `Added filename` transcript text only; the chat needs visible thumbnails too.
- Follow-up note: P26b covered general attachments, but mark chips still needed visual thumbnails and the same fullscreen preview in composer and transcript.

## Phases

1. Tighten composer send readiness so attached images are first-class draft content.
2. Render sent image inputs as transcript thumbnails.
3. Run focused desktop build/static checks.
4. Dogfood in the real Codex Local app using the `test26` project, attach screenshots, and send a quick image-aware prompt.
5. Move this plan to done with a compact verification note.
6. Extend the same visual chip/lightbox pattern to App Preview marks, Mockup Preview marks, and attached agent change marks, preserving existing hidden mark metadata and the locked Canvas v2 preview header.

## Verification

- `npm --prefix apps/desktop run build`
- `git diff --check`
- Electron dogfood in `C:\Users\drago\Desktop\test26`:
  - Native drag/drop added two PNG thumbnail chips to the composer.
  - Send was enabled with image attachments present.
  - A quick prompt received image-aware answers for both screenshots.
  - Activity showed `No file changes yet`.
  - After renderer rebuild/reload, the completed chat transcript showed two sent image thumbnails above the user message and no fallback `Added filename` notes.
- Screenshots are in `artifacts/p26b-composer-image-attachments/`.
