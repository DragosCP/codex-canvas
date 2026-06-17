import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p19-plan-preview-test-"));
const outfile = path.join(tempDir, "planPreview.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/planPreview.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const { parsePlanPreviewSpec, stripPlanPreviewBlocks, planPreviewDecisionSummary } =
    await import(pathToFileURL(outfile).href);

  const message = [
    "Plan:",
    "- Add deadline awareness through countdown cards.",
    "",
    "```codex-plan-preview",
    JSON.stringify(
      {
        version: 1,
        summary: "Compare deadline workflows.",
        variants: [
          {
            id: "A",
            title: "Countdown cards",
            tradeoff: "Fast scanning without adding a new route.",
            placement: "sidePanel",
            summary: "Shows due dates beside the current task list.",
            components: [
              {
                kind: "panel",
                label: "Deadline focus",
                body: "Today, tomorrow, and later tasks appear together.",
                actionLabel: "Review dates",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

  const parsed = parsePlanPreviewSpec(message);
  assert.equal(parsed?.variants.length, 1);
  assert.equal(parsed?.variants[0].title, "Countdown cards");
  assert.equal(parsed?.variants[0].components[0].label, "Deadline focus");
  assert.equal(stripPlanPreviewBlocks(message).includes("codex-plan-preview"), false);
  assert.equal(stripPlanPreviewBlocks(message).includes("Countdown cards"), false);

  const summary = planPreviewDecisionSummary({
    previewSpec: parsed,
    previewSelectedVariantId: "A",
    previewSession: {
      previewUrl: "http://localhost:5173",
      route: "http://localhost:5173/tasks",
      viewport: "desktop",
      interactionState: "Option A: Review dates state visible",
      cleanupStatus: "injected",
      updatedAt: 1,
    },
  });
  assert.match(summary, /Selected live app preview option A: Countdown cards/);
  assert.match(summary, /Preview route at decision time: http:\/\/localhost:5173\/tasks/);

  console.log("P19 plan preview parser check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
