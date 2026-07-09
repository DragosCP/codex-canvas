import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p33b-draft-prompt-contract-"));
const appOutfile = path.join(tempDir, "App.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/App.tsx")],
  outfile: appOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  define: {
    "import.meta.env": "{}",
  },
  logLevel: "silent",
});

const workflowContractPhrases = [
  "do not stop at an explanation, card, strip, diagram, or static concept",
  "Build a temporary in-app workflow using existing components and only the local feature adapters needed for the requested feature",
  "Include the entry point, the menu or first action, the selected state, the review/approval state when relevant, and the result state",
  "If the workflow result belongs in chat, messages, notifications, or another existing product output surface, show it returning through that normal surface",
  "Make it clickable where practical with temporary local state for the requested feature",
  "Do not wire real backend, network, auth, billing, storage, or connector integration unless explicitly requested",
  "Name temporary feature behavior in the final response so Build this can replace it with real integration later",
];

const featureInPlacePhrases = [
  "The Draft must be the current app plus one temporary feature, not a standalone demo",
  "Preserve the existing app shell, providers, router, navigation, primary screens, design system, and normal workflow",
  "Insert the feature at the natural place in the real product journey",
  "Use the current app state and visible product surface where possible",
  "Treat user-provided docs or files as research context for placement and behavior decisions",
  "Do not fabricate unrelated auth, onboarding, workspace, bootstrap, profile, billing, or chat-list state",
  "Do not replace the app with a standalone demo page, wildcard route, isolated marketing screen, static explanation, diagram, or high-fidelity wireframe",
  "Do not replace the main app router/providers or route all paths to one demo page",
  "New draft-only routes/components are allowed only when they are reached from the existing product flow",
  "Name temporary feature data, local feature adapters, visual-only UI boundaries, and backend integration assumptions in the final response so Build this can replace or apply them",
];

function assertContainsCoreContract(prompt) {
  for (const phrase of workflowContractPhrases) {
    assert.match(prompt, new RegExp(escapeRegExp(phrase)));
  }
  assert.doesNotMatch(prompt, /\bGitHub\b/);
  assert.doesNotMatch(prompt, /\bSupabase\b/);
  assert.doesNotMatch(prompt, /\bMCP\b/);
}

function assertContainsFeatureInPlaceContract(prompt) {
  for (const phrase of featureInPlacePhrases) {
    assert.match(prompt, new RegExp(escapeRegExp(phrase)));
  }
  assert.doesNotMatch(prompt, /\bGitHub\b/);
  assert.doesNotMatch(prompt, /\bSupabase\b/);
  assert.doesNotMatch(prompt, /\bMCP\b/);
}

function assertContainsExperientialContract(prompt) {
  assertContainsCoreContract(prompt);
  assertContainsFeatureInPlaceContract(prompt);
  assert.doesNotMatch(prompt, /prefer draft-only fabricated local state/i);
  assert.doesNotMatch(prompt, /\bGitHub\b/);
  assert.doesNotMatch(prompt, /\bSupabase\b/);
  assert.doesNotMatch(prompt, /\bMCP\b/);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

try {
  const {
    EXPERIENTIAL_DRAFT_PROMPT_CONTRACT,
    FEATURE_DRAFT_OPERATING_PROMPT,
    FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
    featureDraftRevisionPrompt,
    featureDraftWorkspacePrompt,
  } = await import(pathToFileURL(appOutfile).href);

  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Draft is one temporary feature inserted into the existing app/,
  );
  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Do not reuse, extend, or depend on a prior Draft unless the user explicitly asks to revise that Draft/,
  );
  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Treat revisions to the same Draft as continuous work in the same Draft workspace/,
  );
  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /desktop app owns Draft preview serving and reload/,
  );
  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /do not create another preview URL just to prove readiness/,
  );
  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Never run npm\/pnpm\/yarn\/bun dev, preview, start, vite preview, vite dev, next dev, serve, http-server/,
  );
  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Do not say you will start a fresh production preview, find a new port, bring up a fresh review URL/,
  );
  assert.doesNotMatch(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Start or identify a server for the current Draft workspace on a confirmed fresh port/,
  );
  assert.doesNotMatch(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /unless the user explicitly asks you to do that in the chat/,
  );
  assert.doesNotMatch(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Proposal Canvas|A\/B\/C|codex-plan-preview|visual proposal/i,
  );
  assertContainsCoreContract(EXPERIENTIAL_DRAFT_PROMPT_CONTRACT);
  assertContainsFeatureInPlaceContract(FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT);
  assertContainsExperientialContract(
    `${EXPERIENTIAL_DRAFT_PROMPT_CONTRACT}\n${FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT}`,
  );

  const project = {
    id: "vision-weaver-main",
    name: "Vision Weaver Main",
    path: "C:\\Users\\drago\\Desktop\\vision-weaver-main",
  };
  const status = {
    empty: false,
    reason: "",
    meaningfulEntries: ["package.json", "src", "index.html"],
    ignoredEntries: [],
  };
  const draft = {
    id: "draft-test",
    name: "Tool workflow draft",
    summary: "Draft ready for review.",
  };
  const liveContext = "Live context:\n- Route: /chat\n- Viewport: desktop";

  const workspacePrompt = featureDraftWorkspacePrompt(
    "I want to see how external tools could work inside this app. Show me the workflow before implementation.",
    project,
    status,
    false,
    liveContext,
    draft,
  );
  assertContainsExperientialContract(workspacePrompt);
  assert.match(workspacePrompt, /Create one coherent Draft for this feature only/);
  assert.match(workspacePrompt, /Work only in the current Draft workspace/);
  assert.doesNotMatch(
    workspacePrompt,
    /Proposal Canvas|A\/B\/C|codex-plan-preview|Resolved Canvas action/i,
  );

  const revisionPrompt = featureDraftRevisionPrompt(
    draft,
    "Make the selected tool review step feel clearer before the result returns to chat.",
    liveContext,
  );
  assertContainsExperientialContract(revisionPrompt);
  assert.match(revisionPrompt, /Revise only this Draft/);
  assert.match(revisionPrompt, /Do not edit the real Live project source/);
  assert.doesNotMatch(
    revisionPrompt,
    /Proposal Canvas|A\/B\/C|codex-plan-preview|Resolved Canvas action/i,
  );

  console.log("p33b draft prompt contract passed");
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
