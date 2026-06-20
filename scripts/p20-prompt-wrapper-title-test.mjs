import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p20-title-test-"));
const outfile = path.join(tempDir, "itemUtils.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/itemUtils.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const { threadTitle } = await import(pathToFileURL(outfile).href);

  const cases = [
    {
      name: "Plan Mode wrapper",
      input: [
        "Plan Mode: investigate and propose the plan first.",
        "Do not edit files yet.",
        "",
        "User request:",
        "Make checkout calmer",
      ].join("\n"),
      expected: "Make checkout calmer",
    },
    {
      name: "Canvas question",
      input: [
        "[Codex Canvas Question Context]",
        "",
        "Desktop state:",
        "- Project already has app files: yes",
        "",
        "Original user request:",
        "Improve the dashboard navigation",
      ].join("\n"),
      expected: "Improve the dashboard navigation",
    },
    {
      name: "Saved preview artifact creation",
      input: [
        "[Codex Saved Mockup Review Context]",
        "",
        "Task:",
        "- Create one saved HTML review preview.",
        "",
        "User request:",
        "Show me the settings redesign first",
      ].join("\n"),
      expected: "Show me the settings redesign first",
    },
    {
      name: "Saved mockup review",
      input: [
        "[Codex Saved Mockup Review Context]",
        "",
        "Saved options:",
        "- A: Quiet layout",
        "",
        "User request:",
        "Make option A denser",
      ].join("\n"),
      expected: "Make option A denser",
    },
    {
      name: "Visual decision selection",
      input: [
        "[Codex Visual Decision Selection]",
        "",
        "Selected desktop decision option:",
        "- Option id: mockups",
        "",
        "User-visible composer text:",
        "Show three mockups",
      ].join("\n"),
      expected: "Show three mockups",
    },
    {
      name: "Build selected mockup visible request",
      input: [
        "[Codex Build Selected Mockup]",
        "",
        "The user selected a saved mockup as a starting point.",
        "",
        "User-visible request:",
        "Implement option A, but make the marked filters compact",
        "",
        "Supporting selected mockup context:",
        "- Option: A",
        "- Title: Quiet board",
      ].join("\n"),
      expected: "Implement option A, but make the marked filters compact",
    },
    {
      name: "Accepted plan with preview context",
      input: [
        "I accept this plan. Implement it now.",
        "",
        "Project context explicitly attached by the user:",
        "Selected live app preview guidance.",
        "",
        "Selected live app preview option A: Countdown cards.",
      ].join("\n"),
      expected: "I accept this plan. Implement it now.",
    },
    {
      name: "Attached context marker at start",
      input: [
        "Project context explicitly attached by the user:",
        "@MockupMark project=\"Example\"",
        "mark=Mockup mark 1",
      ].join("\n"),
      expected: "New chat",
    },
  ];

  for (const testCase of cases) {
    const actual = threadTitle({
      id: testCase.name,
      name: testCase.input,
      preview: null,
      cwd: null,
      status: { type: "loaded" },
      turns: [],
      updatedAt: 0,
    });
    assert.equal(actual, testCase.expected, testCase.name);
  }

  console.log("P20 prompt wrapper visible-title check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
