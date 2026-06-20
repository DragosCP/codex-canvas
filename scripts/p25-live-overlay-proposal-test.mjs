import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p25-live-overlay-test-"));
const outfile = path.join(tempDir, "planPreview.mjs");
const visualDecisionOutfile = path.join(tempDir, "visualDecision.mjs");
const itemUtilsOutfile = path.join(tempDir, "itemUtils.mjs");
const eventsOutfile = path.join(tempDir, "useAppServerEvents.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/planPreview.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/visualDecision.ts")],
  outfile: visualDecisionOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/itemUtils.ts")],
  outfile: itemUtilsOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/hooks/useAppServerEvents.ts")],
  outfile: eventsOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const { parsePlanPreviewSpec, planPreviewDecisionSummary } = await import(
    pathToFileURL(outfile).href
  );
  const { parseVisualDecisionStrip, stripVisualDecisionBlocks } = await import(
    pathToFileURL(visualDecisionOutfile).href
  );
  const { replaceTurn } = await import(pathToFileURL(itemUtilsOutfile).href);
  const { mergeBufferedAgentMessagesForTurn } = await import(
    pathToFileURL(eventsOutfile).href
  );

  const parsed = parsePlanPreviewSpec(
    [
      "Proposal ready.",
      "```codex-plan-preview",
      JSON.stringify({
        version: 1,
        summary: "Settings placement options.",
        variants: [
          {
            id: "A",
            title: "Header settings",
            tradeoff: "Fast to find without competing with add task.",
            placement: "topbar",
            route: "http://127.0.0.1:5173/",
            targetRegion: "header actions",
            summary: "Adds a secondary settings action near the existing toolbar.",
            highlights: [
              {
                id: "settings-action",
                label: "Settings action",
                note: "New secondary settings control.",
                areaMark: {
                  x: 1180,
                  y: 42,
                  width: 58,
                  height: 58,
                  viewportWidth: 1440,
                  viewportHeight: 900,
                  route: "http://127.0.0.1:5173/",
                  note: "New secondary settings control.",
                  createdAt: 1,
                },
              },
            ],
            components: [
              {
                kind: "button",
                label: "Settings",
                body: "Icon-only settings button beside the main add action.",
                actionLabel: "Open preferences",
              },
            ],
          },
        ],
      }),
      "```",
    ].join("\n"),
  );

  assert.equal(parsed?.variants.length, 1);
  assert.equal(parsed?.variants[0].route, "http://127.0.0.1:5173/");
  assert.equal(parsed?.variants[0].targetRegion, "header actions");
  assert.equal(parsed?.variants[0].highlights?.[0].label, "Settings action");
  assert.equal(parsed?.variants[0].highlights?.[0].areaMark.width, 58);

  const parsedModelLike = parsePlanPreviewSpec(
    [
      "Three options.",
      "```codex-plan-preview",
      JSON.stringify({
        summary: "Settings placement options.",
        route: "http://127.0.0.1:5173/",
        viewState: "board view",
        variants: [
          {
            id: "A",
            title: "Header settings",
            tradeoff: "Fast to find.",
            placement: "topbar",
            targetRegion: "header actions",
            summary: "Adds a secondary settings action.",
            highlights: [
              {
                label: "Settings action",
                note: "New secondary settings control.",
                areaMark: {
                  x: 1180,
                  y: 42,
                  width: 58,
                  height: 58,
                  viewportWidth: 1440,
                  viewportHeight: 900,
                  createdAt: "2026-06-18T10:39:12.000Z",
                },
              },
            ],
            components: [
              {
                kind: "button",
                label: "Settings",
                body: "Icon-only settings button beside add.",
              },
            ],
          },
        ],
      }),
      "```",
    ].join("\n"),
  );

  assert.equal(parsedModelLike?.version, 1);
  assert.equal(parsedModelLike?.variants[0].route, "http://127.0.0.1:5173/");
  assert.equal(parsedModelLike?.variants[0].viewState, "board view");
  assert.equal(
    parsedModelLike?.variants[0].highlights?.[0].areaMark.createdAt > 0,
    true,
  );

  const summary = planPreviewDecisionSummary({
    previewSpec: parsed,
    previewSelectedVariantId: "A",
  });
  assert.match(summary, /Target route: http:\/\/127\.0\.0\.1:5173\//);
  assert.match(summary, /Proposal highlights: Settings action/);

  const appTsx = readFileSync(
    path.join(repoRoot, "apps/desktop/src/App.tsx"),
    "utf8",
  );
  assert.match(appTsx, /LIVE_OVERLAY_PROPOSAL_SENTINEL/);
  assert.match(appTsx, /liveOverlayProposalOnComplete/);
  assert.match(appTsx, /For small current-app visual ideas/);
  assert.match(appTsx, /temporary live proposal with codex-plan-preview metadata/);
  assert.match(appTsx, /Reason about the user's request and author the questionnaire yourself/);
  assert.match(appTsx, /Do not copy fixed default wording/);
  assert.match(appTsx, /Do not describe or request visible Codex proposal chrome/);
  assert.match(appTsx, /placeholder controls such as \\`Open settings\\`/);
  assert.doesNotMatch(appTsx, /apply your proposal as temporary UI/);
  assert.match(
    appTsx,
    /Do not include Markdown code fences or triple backticks inside decision-strip JSON string values/,
  );
  assert.doesNotMatch(
    appTsx,
    /Create one saved HTML review preview under \.codex\/mockups for this current-app change/,
  );

  const nestedFenceDecision = [
    "I can show this first.",
    "",
    "```codex-decision-strip",
    JSON.stringify(
      {
        title: "How should I approach this?",
        summary: "Choose a path.",
        options: [
          {
            id: "quick-preview",
            label: "Show 1 option",
            description: "Create one review-only preview.",
            prompt:
              "Return one fenced ```codex-plan-preview JSON block without editing files.",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

  assert.equal(
    parseVisualDecisionStrip(nestedFenceDecision)?.options[0].label,
    "Show 1 option",
  );
  assert.equal(stripVisualDecisionBlocks(nestedFenceDecision), "I can show this first.");
  assert.equal(
    /codex-plan-preview JSON block|without editing files/.test(
      stripVisualDecisionBlocks(nestedFenceDecision),
    ),
    false,
  );

  const completedTurn = {
    id: "turn-1",
    status: "completed",
    error: null,
    startedAt: 1,
    completedAt: 2,
    durationMs: 1,
    items: [
      {
        type: "agentMessage",
        id: "agent-1",
        phase: "final_answer",
        text: "Proposal ready.",
      },
    ],
  };
  const streamedTurn = {
    ...completedTurn,
    status: "inProgress",
    items: [
      {
        type: "agentMessage",
        id: "agent-1",
        phase: "final_answer",
        text: [
          "Proposal ready.",
          "```codex-plan-preview",
          JSON.stringify({ version: 1, variants: [] }),
          "```",
        ].join("\n"),
      },
    ],
  };
  const replacedTurns = replaceTurn([streamedTurn], completedTurn);
  assert.match(
    replacedTurns[0].items[0].text,
    /```codex-plan-preview/,
    "completed turn should preserve longer streamed preview payload",
  );

  const mergedBufferedTurn = mergeBufferedAgentMessagesForTurn(completedTurn, {
    "agent-1": streamedTurn.items[0],
  });
  assert.match(
    mergedBufferedTurn.items[0].text,
    /```codex-plan-preview/,
    "completed turn should recover streamed preview payload from event buffer",
  );

  const livePreviewTsx = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/LiveAppPreview.tsx"),
    "utf8",
  );
  assert.match(livePreviewTsx, /Show changes/);
  assert.match(livePreviewTsx, /proposal-highlight/);
  assert.match(livePreviewTsx, /root\.hidden = true/);
  for (const bannedVisibleProposalChrome of [
    "codex-preview-bar",
    "codex-preview-panel",
    "codex-preview-modal",
    "guestPreviewCss",
    "renderCodexPreview",
    "<span>Proposed",
    "Proposed UI active",
    "Injecting proposed UI",
    "Hide proposed UI",
    "Show proposed UI",
    "Hide preview",
    "Show preview",
    "Open settings",
    "Open Settings",
  ]) {
    assert.equal(
      livePreviewTsx.includes(bannedVisibleProposalChrome),
      false,
      `LiveAppPreview must not render visible proposal chrome: ${bannedVisibleProposalChrome}`,
    );
  }

  console.log("P25 live overlay proposal check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
