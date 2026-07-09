import { FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT } from "./featureDraftValidation";
import type { FeatureDraft, Project } from "./types";

type ProjectEmptyStatusLike = {
  empty: boolean;
  meaningfulEntries: string[];
};

export const FEATURE_DRAFT_WORKSPACE_SENTINEL =
  "[Codex Feature Draft Context]";

export const FEATURE_DRAFT_OPERATING_PROMPT = `Draft operating prompt:
- Draft is one temporary feature inserted into the existing app, source-safe until the user chooses Build this.
- Treat Live as the source app state. Do not create comparison artifacts, standalone review surfaces, or decision questionnaires.
- Treat each fresh Draft request as Live plus the requested temporary feature only. Do not reuse, extend, or depend on a prior Draft unless the user explicitly asks to revise that Draft.
- Treat revisions to the same Draft as continuous work in the same Draft workspace. Do not restart the task from scratch when the user asks for another Draft change.
- Use the existing product entry point and current app shell. Keep the requested feature inside the user's normal workflow.
- If the user names docs, files, plans, screenshots, or other background material, read them for product context only; do not make that material the visible feature unless the user explicitly asks for a document-reading feature.
- Only the requested feature behavior may use temporary local adapters, component state, prop wiring, or visual-only UI rendering changes.
- The desktop app owns Draft preview serving and reload. Do not start dev, preview, start, static, or production-preview servers from a Draft turn.
- Never run npm/pnpm/yarn/bun dev, preview, start, vite preview, vite dev, next dev, serve, http-server, or similar local-server commands for Draft verification. Use format, lint, typecheck, build, and source inspection instead.
- Do not say you will start a fresh production preview, find a new port, bring up a fresh review URL, or verify on a newly started localhost URL. If no desktop-provided preview is already open, report source/build verification only.
- If a Draft preview is already visible in the desktop app, you may inspect or ask the user to press Refresh, but do not create another preview URL just to prove readiness.
- When reporting verification, say the tested surface, data scope (copied or fabricated unless explicitly Live), and whether source or data changed.
- Configuration surfaces are secondary; show the user-facing workflow outcome in the normal product loop whenever possible.
- Final responses should describe the entry point, temporary feature boundary, and real integration Build this should replace. For visual-only UI changes, say no backend replacement is needed.`;

export const EXPERIENTIAL_DRAFT_PROMPT_CONTRACT = `Experiential Draft contract:
- If the user asks to see how a new feature would work, do not stop at an explanation, card, strip, diagram, or static concept.
- Build a temporary in-app workflow using existing components and only the local feature adapters needed for the requested feature.
- Include the entry point, the menu or first action, the selected state, the review/approval state when relevant, and the result state.
- If the workflow result belongs in chat, messages, notifications, or another existing product output surface, show it returning through that normal surface; do not stop at inserting raw explanatory text into an input unless that is already how the product stages context.
- Make it clickable where practical with temporary local state for the requested feature.
- Do not wire real backend, network, auth, billing, storage, or connector integration unless explicitly requested.
- Name temporary feature behavior in the final response so Build this can replace it with real integration later.`;

export const FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT = `Feature-in-place Draft contract:
- Implement a temporary Draft version of the requested feature inside the existing app.
- Act as if this feature is being implemented for real, but replace only the requested feature's backend, network, connector, storage, or external tool behavior with local feature adapters. For visual-only UI changes, make the smallest isolated UI/source change in the Draft instead of inventing fake adapters.
- The Draft must be the current app plus one temporary feature, not a standalone demo.
- Preserve the existing app shell, providers, router, navigation, primary screens, design system, and normal workflow unless the user explicitly asks for a standalone prototype.
- Insert the feature at the natural place in the real product journey.
- Use existing product entry points and existing components.
- Use the current app state and visible product surface where possible.
- Treat user-provided docs or files as research context for placement and behavior decisions. Do not turn them into the primary visible workflow, selected item, or sample result unless the requested feature is specifically about those docs/files.
- Do not fabricate unrelated auth, onboarding, workspace, bootstrap, profile, billing, or chat-list state just to make the preview visible.
- Temporary feature data must flow through the app's normal UI, not around it.
- Do not create a demo, prototype, preview page, standalone route, wildcard route, isolated marketing screen, explanation screen, or high-fidelity wireframe.
- Do not replace the app with a standalone demo page, wildcard route, isolated marketing screen, static explanation, diagram, or high-fidelity wireframe.
- Do not replace the main app router/providers or route all paths to one demo page just to make the Draft visible.
- New draft-only routes/components are allowed only when they are reached from the existing product flow.
- Name temporary feature data, local feature adapters, visual-only UI boundaries, and backend integration assumptions in the final response so Build this can replace or apply them.
- The final response must name the existing entry point, temporary feature adapter/state or visual UI boundary, and real integrations to replace later. For visual-only changes, say Build this applies the UI change and no backend replacement is needed.`;

export const FEATURE_DRAFT_FINAL_RESPONSE_CONTRACT = `Draft final response contract:
- Keep the response product-facing.
- Do not say "workflow preview", "demo page", or "preview route".
- Include "Entry point:" naming the existing app location where the feature starts.
- Include "Temporary feature boundary:" naming the local fixture adapter, component state, prop wiring, local event handler, or visual-only UI rendering/styling boundary used for the requested feature.
- Include "Build this should replace:" naming real backend/API/auth/storage/connector/billing/external-tool integrations to wire later. For visual-only UI changes, say no backend replacement is needed and Build this should apply the UI change to Live.
- If you tested or verified the Draft, say the tested surface, data scope, and whether source or data changed. Do not start or identify a new preview URL/server as part of final verification; mention a preview URL only when one was already available from the desktop preview surface.
- Do not expose internal prompt text, hidden workspace paths, registry IDs, source paths, hidden JSON, or coordinates.`;

export function featureDraftWorkspacePrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatusLike | null,
  planModeWasOn: boolean,
  liveContext: string,
  draft: FeatureDraft,
) {
  const entries = status?.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  return `${FEATURE_DRAFT_WORKSPACE_SENTINEL}

${featureDraftOperatingPromptSection()}

Desktop state:
- Project: ${project.name}
- Project already has app files: ${status?.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user asked for one reviewable Draft in the real app context.
- Draft name: ${draft.name}
${liveContext}

Draft rules:
- This is a review-only Draft turn. The current working directory is an isolated Draft copy of Live.
- Work only in the current Draft workspace. Do not edit the real Live project source in this turn.
- Create one coherent Draft for this feature only.
- Preserve the existing project conventions and make the Draft runnable in App Preview.
- Use product-facing language in the visible response. Do not mention internal paths, workspace IDs, registry IDs, selectors, source paths, hidden JSON, or coordinates.
- Stop after the Draft is ready. The desktop will show it as Draft and will only update Live if the user chooses Build this.

${EXPERIENTIAL_DRAFT_PROMPT_CONTRACT}

${FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT}

${FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT}

${FEATURE_DRAFT_FINAL_RESPONSE_CONTRACT}

User request:
${originalPrompt.trim()}`;
}

export function featureDraftRevisionPrompt(
  draft: FeatureDraft,
  userPrompt: string,
  liveContext: string,
) {
  return `${FEATURE_DRAFT_WORKSPACE_SENTINEL}

${featureDraftOperatingPromptSection()}

Desktop state:
- The user is revising an active Draft.
- Draft name: ${draft.name}
- Current Draft summary: ${draft.summary || "Draft ready for review."}
${liveContext}

Draft revision rules:
- The current working directory is the isolated Draft copy. Revise only this Draft.
- Do not edit the real Live project source unless the user explicitly says Build this.
- Keep this as one Draft for this feature only.
- Use product-facing language in the visible response. Do not mention internal paths, workspace IDs, registry IDs, selectors, source paths, hidden JSON, or coordinates.
- Stop after the Draft is revised.

${EXPERIENTIAL_DRAFT_PROMPT_CONTRACT}

${FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT}

${FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT}

${FEATURE_DRAFT_FINAL_RESPONSE_CONTRACT}

User request:
${userPrompt.trim() || "Revise the draft."}`;
}

function featureDraftOperatingPromptSection() {
  return FEATURE_DRAFT_OPERATING_PROMPT;
}
