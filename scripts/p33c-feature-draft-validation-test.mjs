import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p33c-feature-draft-validation-"));
const validationOutfile = path.join(tempDir, "featureDraftValidation.mjs");
const appOutfile = path.join(tempDir, "App.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/featureDraftValidation.ts")],
  outfile: validationOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

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

try {
  const {
    FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT,
    featureDraftValidationMessage,
    isBlockingFeatureDraftValidationResult,
    validateFeatureDraftCompletion,
    validateFeatureDraftFirstEdit,
    validateFeatureDraftFinalResponse,
    validateFeatureDraftFirstDiff,
    validateFeatureDraftPlacementPreflight,
    validateFeatureDraftPreValidationCommand,
  } = await import(pathToFileURL(validationOutfile).href);
  const {
    FEATURE_DRAFT_FINAL_RESPONSE_CONTRACT,
    FEATURE_DRAFT_OPERATING_PROMPT,
    FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
    featureDraftWorkspacePrompt,
  } = await import(pathToFileURL(appOutfile).href);

  assert.match(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Treat Live as the source app state/,
  );
  assert.doesNotMatch(
    FEATURE_DRAFT_OPERATING_PROMPT,
    /Proposal Canvas|A\/B\/C|codex-plan-preview|visual proposal/i,
  );
  assert.match(
    FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
    /Implement a temporary Draft version of the requested feature inside the existing app/,
  );
  assert.match(
    FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
    /replace only the requested feature's backend, network, connector, storage, or external tool behavior with local feature adapters/,
  );
  assert.match(
    FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
    /Treat user-provided docs or files as research context for placement and behavior decisions/,
  );
  assert.doesNotMatch(
    FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
    /add draft-only fake state at the smallest provider\/hook\/data boundary/,
  );
  assert.match(
    FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT,
    /Before editing, identify the existing screen\/component to modify/,
  );
  assert.match(
    FEATURE_DRAFT_FINAL_RESPONSE_CONTRACT,
    /Temporary feature boundary:/,
  );

  const standalonePage = validateFeatureDraftFirstDiff([
    {
      path: "src/pages/DraftMcpWorkflowPage.tsx",
      kind: "add",
      diff: "+export function DraftMcpWorkflowPage() { return null; }",
    },
  ]);
  assert.equal(standalonePage.ok, false);
  assert.equal(standalonePage.code, "standalone_draft_page");
  assert.match(
    featureDraftValidationMessage(standalonePage),
    /standalone draft\/preview page/,
  );

  const routerBypass = validateFeatureDraftFirstDiff([
    {
      path: "src/App.tsx",
      kind: "update",
      diff: [
        "+import { DraftMcpWorkflowPage } from './pages/DraftMcpWorkflowPage';",
        "+<Routes>",
        "+  <Route path=\"*\" element={<DraftMcpWorkflowPage />} />",
        "+</Routes>",
      ].join("\n"),
    },
  ]);
  assert.equal(routerBypass.ok, false);
  assert.equal(routerBypass.code, "router_bypass");

  const staleDraftArtifact = validateFeatureDraftCompletion({
    changedFiles: [
      {
        kind: "updated",
        path: ".codex/drafts/i-want-to-see-how-mcp/brief.md",
        hash: "old-draft",
        size: 20,
      },
    ],
    finalText:
      "Entry point: the existing composer tools menu.\n" +
      "Temporary feature boundary: local fixture adapter and component state.\n" +
      "Build this should replace: real connector auth and tool execution.",
  });
  assert.equal(staleDraftArtifact.ok, false);
  assert.equal(staleDraftArtifact.code, "stale_draft_artifact");

  const installBeforePlacement =
    validateFeatureDraftPreValidationCommand("npm install");
  assert.equal(installBeforePlacement.ok, false);
  assert.equal(
    installBeforePlacement.code,
    "blocked_command_before_placement",
  );
  assert.equal(
    isBlockingFeatureDraftValidationResult(installBeforePlacement),
    false,
    "preflight command ordering should warn without interrupting an active Draft turn",
  );
  assert.equal(
    validateFeatureDraftPreValidationCommand({
      command: "bun run build",
      firstDiffValidated: false,
    }).ok,
    false,
  );
  assert.equal(
    validateFeatureDraftPreValidationCommand({
      command: "bun run build",
      firstDiffValidated: true,
    }).ok,
    true,
  );
  const previewAfterPlacement = validateFeatureDraftPreValidationCommand({
    command: "npm run preview -- --host 127.0.0.1 --port 4231",
    firstDiffValidated: true,
  });
  assert.equal(previewAfterPlacement.ok, false);
  assert.equal(previewAfterPlacement.code, "blocked_preview_server_command");
  assert.equal(
    isBlockingFeatureDraftValidationResult(previewAfterPlacement),
    true,
    "Draft preview server commands should interrupt even after placement is validated",
  );
  assert.equal(
    validateFeatureDraftPreValidationCommand({
      command: "vite preview --host 127.0.0.1 --port 4231",
      firstDiffValidated: true,
    }).ok,
    false,
  );

  const validDiff = validateFeatureDraftFirstDiff([
    {
      path: "src/components/chat/Composer.tsx",
      kind: "update",
      diff: "+<ToolMenu fakeMcpServers={draftMcpServers} />",
    },
    {
      path: "src/hooks/useMcpDraftFixtures.ts",
      kind: "add",
      diff: "+export const draftMcpServers = [];",
    },
  ]);
  assert.equal(validDiff.ok, true);

  const editBeforePreflight = validateFeatureDraftFirstEdit({
    placementPreflightValidated: false,
    changes: [
      {
        path: "src/components/chat/Composer.tsx",
        kind: "update",
        diff: "+<ToolMenu fakeMcpServers={draftMcpServers} />",
      },
    ],
  });
  assert.equal(editBeforePreflight.ok, false);
  assert.equal(editBeforePreflight.code, "missing_placement_preflight");
  assert.equal(
    isBlockingFeatureDraftValidationResult(editBeforePreflight),
    false,
    "missing preflight should not interrupt an active Draft turn mid-edit",
  );
  assert.equal(
    isBlockingFeatureDraftValidationResult(routerBypass),
    true,
    "router bypass remains a hard Draft validation block",
  );

  assert.equal(
    validateFeatureDraftFirstEdit({
      placementPreflightValidated: true,
      changes: [
        {
          path: "src/components/chat/Composer.tsx",
          kind: "update",
          diff: "+<ToolMenu fakeMcpServers={draftMcpServers} />",
        },
      ],
    }).ok,
    true,
  );

  const invalidFinal = validateFeatureDraftFinalResponse(
    "The MCP workflow preview is ready on a preview route.",
  );
  assert.equal(invalidFinal.ok, false);
  assert.equal(invalidFinal.code, "standalone_final_response");

  const missingBoundary = validateFeatureDraftPlacementPreflight(
    "Existing screen/component: Chat composer. Entry point: composer tools menu. Result state: chat message.",
  );
  assert.equal(missingBoundary.ok, false);
  assert.equal(missingBoundary.code, "missing_fake_state_boundary");

  const validPreflight = validateFeatureDraftPlacementPreflight(
    [
      "Existing screen/component: Chat composer and settings drawer.",
      "Entry point: composer tools menu.",
      "Temporary feature adapter: local MCP fixture adapter and component state.",
      "Selected state: connected server selected.",
      "Review/approval state: normal chat approval card.",
      "Result state: tool result returns as a chat message.",
      "Build this should replace the fake adapter with real MCP connector auth, storage, and tool execution integration.",
    ].join("\n"),
  );
  assert.equal(validPreflight.ok, true);

  assert.equal(
    validateFeatureDraftPlacementPreflight(
      "Draft placement preflight now: entry point is the chat composer area, temporary feature adapter is a local MCP fixture and component state, selected state is filesystem MCP selected, review state is tool approval, result state is a normal-looking chat answer, and Build this should replace the fake adapter with real MCP connector auth, storage, and tool execution integration.",
    ).ok,
    true,
  );

  assert.equal(
    validateFeatureDraftPlacementPreflight(
      [
        "Existing screen/component: app shell sidebar.",
        "Entry point: left navigation.",
        "Temporary feature boundary: the nav item rendering for the Admin button; this is visual-only UI prop wiring, not a fake backend adapter.",
        "Selected state: the normal Settings entry stays selected.",
        "Result state: the left nav reflows without the Admin button.",
        "No backend replacement is needed; Build this should apply the UI-only source change to Live.",
      ].join("\n"),
    ).ok,
    true,
  );

  assert.equal(
    validateFeatureDraftPlacementPreflight(
      "I found the existing entry point: the app shell's sidebar. The requested selected state remains /settings?section=admin, and the Draft boundary is just the nav item rendering, not the settings/admin panels or route redirect.",
    ).ok,
    true,
  );

  const validFinal =
    "Entry point: the existing composer tools menu in the AgentCat chat shell.\n" +
    "Temporary feature boundary: local MCP fixture adapter and component state feed connected servers, tools, approvals, and results through the normal chat UI.\n" +
    "Build this should replace: real MCP connector discovery, auth, storage, server calls, and tool execution.";
  assert.equal(validateFeatureDraftFinalResponse(validFinal).ok, true);

  const validVisualFinal =
    "Entry point: the existing app shell sidebar.\n" +
    "Temporary feature boundary: visual-only nav item rendering removes the Admin button while Settings keeps the admin tab.\n" +
    "Build this should replace: no backend replacement is needed; Build this should apply the UI-only source change to Live.";
  assert.equal(validateFeatureDraftFinalResponse(validVisualFinal).ok, true);
  assert.equal(
    validateFeatureDraftCompletion({
      changedFiles: [
        {
          kind: "updated",
          path: "src/components/chat/Composer.tsx",
          hash: "1",
          size: 10,
        },
        {
          kind: "created",
          path: "src/hooks/useMcpDraftFixtures.ts",
          hash: "2",
          size: 10,
        },
      ],
      finalText: validFinal,
    }).ok,
    true,
  );

  const project = {
    id: "agentcat",
    name: "AgentCat",
    path: "C:\\Users\\drago\\Desktop\\vision-weaver-main",
  };
  const status = {
    empty: false,
    reason: "",
    meaningfulEntries: ["package.json", "src", "index.html"],
    ignoredEntries: [],
  };
  const draft = {
    draftId: "draft-agentcat-mcp",
    name: "AgentCat MCP draft",
    summary: "Generating draft.",
  };
  const prompt = featureDraftWorkspacePrompt(
    "I want to see how MCP could work inside AgentCat. Show me the workflow before implementation.",
    project,
    status,
    false,
    "Live context:\n- Route: /chat",
    draft,
  );
  assert.match(prompt, /Draft placement preflight:/);
  assert.match(prompt, /If you cannot name the existing product surface and temporary feature boundary, stop/);
  assert.match(prompt, /Temporary feature data must flow through the app's normal UI, not around it/);
  assert.match(prompt, /Treat user-provided docs or files as research context/);
  assert.doesNotMatch(prompt, /prefer draft-only fabricated local state/i);
  assert.doesNotMatch(prompt, /auth, onboarding, workspace setup, connector setup, or empty data blocks/i);
  assert.doesNotMatch(
    prompt,
    /Proposal Canvas|A\/B\/C|codex-plan-preview|Resolved Canvas action/i,
  );
  assert.match(prompt, /Do not create a demo, prototype, preview page, standalone route/);
  assert.match(prompt, /Build this should replace:/);

  console.log("p33c feature draft validation passed");
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
