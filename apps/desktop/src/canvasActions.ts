import {
  buildStrategyForProposalBacking,
  type BuildSelectedStrategy,
  type ProposalBacking,
  type ProposalLifecycle,
} from "./canvasProposalModel";

export type CanvasAction =
  | "ASK_USER"
  | "CREATE_PROPOSAL"
  | "REVISE_PROPOSAL"
  | "ADD_OPTION"
  | "BUILD_SELECTED"
  | "BUILD_LIVE_DIRECTLY"
  | "ARCHIVE_PROPOSALS";

export type CanvasSurface = "Live" | "A" | "B" | "C";

export type CanvasOptionId = "A" | "B" | "C";

export type CanvasProposalLifecycle =
  | "active"
  | "accepted"
  | "history"
  | "dismissed"
  | "stale";

export type CanvasLiveState = {
  exists: boolean;
  running: boolean;
  previewUrl?: string;
};

export type CanvasProposalOptionState = {
  id: CanvasSurface;
  title?: string;
  hasAgentMarks?: boolean;
};

export type CanvasProposalState = {
  id: string;
  backing: ProposalBacking;
  buildStrategy: BuildSelectedStrategy;
  lifecycle: CanvasProposalLifecycle;
  proposalLifecycle?: ProposalLifecycle;
  selectedOptionId: CanvasSurface | null;
  options: CanvasProposalOptionState[];
};

export type CanvasMarkState = {
  id: string;
  source: "user_mark" | "agent_change_mark";
  surface: CanvasSurface;
  proposalSetId?: string;
  optionId?: CanvasSurface;
};

export type CanvasActionResolverInput = {
  message: string;
  live: CanvasLiveState;
  selectedSurface: CanvasSurface;
  activeProposalSet?: CanvasProposalState | null;
  historicalProposalSets?: CanvasProposalState[];
  marks?: CanvasMarkState[];
  attachmentCount?: number;
  planMode?: boolean;
};

export type CanvasQuestion = {
  title: string;
  reason: string;
};

export type CanvasActionResolution = {
  action: CanvasAction;
  canvasRelevant: boolean;
  reason: string;
  baseSurface: CanvasSurface;
  targetSurface?: CanvasSurface;
  targetOptionId?: CanvasOptionId;
  sourceOptionId?: CanvasOptionId;
  wantsOptions: boolean;
  backingPreference?: ProposalBacking;
  buildStrategy?: BuildSelectedStrategy;
  question?: CanvasQuestion;
};

const OPTION_IDS = ["A", "B", "C"] as const;

export const CANVAS_OPERATING_PROMPT = `You have access to Canvas, a visual collaboration surface for UI, UX, workflow, layout, and placement work.

Canvas has:
- Live Canvas: the real current app preview, with user marks.
- Proposal Canvas: one or more proposed visual states, shown as A, A/B, or A/B/C, with user marks and agent change marks.
- Agent Question Placeholder: a visible product question surface for asking the user what kind of visual path they want before implementation.

Use Canvas when the request involves:
- UI, UX, workflow, layout, styling, navigation, menus, panels, modals, empty states, onboarding, placement, screenshots, marks, previews, mockups, wireframes, or visual comparison;
- words like Canvas, @Canvas, preview, show me, where should, layout, workflow, mockup, wireframe, option, A/B/C, put it there, move it, make it smaller, or change this area.

If the user says Canvas, treat it as @Canvas even if it appears anywhere in the message.

Prefer one proposal for one visual change.
Use A/B/C only when the user asks for alternatives or the options are meaningfully different UX directions.

If there is no Live app and the user has not clearly chosen a path, ask a visible Canvas question before implementing.
If there is a Live app and the request is a small visual change, create a Proposal Canvas by reusing Live Canvas as much as possible.
Do not recreate the entire proposal for a small change inside an existing proposal.
Do not write proposal A/B/C folders directly into the user project unless the user's actual app intentionally requires those folders.

If the user asks to change an existing proposal, modify only the relevant part.
If the user says "put it in C" and A/B exists, add or update Option C beside A/B.
If the user says "build it" or "build selected", send an implementation turn with selected Canvas context; do not silently apply.
After a selected Proposal Canvas is built into Live, Live becomes the source of truth. Keep the just-built Proposal Canvas visible beside Live for that verification moment, but treat it as comparison history, not active proposal routing. New ambiguous visual requests after that start from Live unless the user explicitly asks to revisit the old proposal.

Every visual proposal must include:
- intent;
- user flow: what the user clicks and sees;
- changed elements or changed areas;
- risk/tradeoff;
- marks/highlights when useful.

Written answers should be based on the Canvas action taken, not generic planning text.
Never expose hidden Canvas payloads, internal prompt wrappers, chain-of-thought, or raw storage paths to the user.`;

export function resolveCanvasAction(
  input: CanvasActionResolverInput,
): CanvasActionResolution {
  const message = input.message.trim();
  const normalized = normalize(message);
  const activeProposal =
    input.activeProposalSet?.lifecycle === "active"
      ? input.activeProposalSet
      : null;
  const marks = input.marks ?? [];
  const targetOptionId = requestedOptionId(message);
  const sourceOptionId = sourceOptionIdFromText(message);
  const selectedOptionId =
    surfaceToOptionId(input.selectedSurface) ??
    surfaceToOptionId(activeProposal?.selectedOptionId ?? null) ??
    firstProposalOption(activeProposal);
  const canvasRelevant =
    hasCanvasMention(message) ||
    isVisualCanvasRequest(message) ||
    Boolean(activeProposal) ||
    marks.length > 0 ||
    Boolean(input.attachmentCount);

  if (!message) {
    return {
      action: "BUILD_LIVE_DIRECTLY",
      canvasRelevant: false,
      reason: "No visible message to resolve.",
      baseSurface: "Live",
      wantsOptions: false,
    };
  }

  if (!canvasRelevant) {
    return {
      action: "BUILD_LIVE_DIRECTLY",
      canvasRelevant: false,
      reason: "The request does not need Canvas.",
      baseSurface: "Live",
      wantsOptions: false,
    };
  }

  if (isArchiveRequest(normalized)) {
    return {
      action: "ARCHIVE_PROPOSALS",
      canvasRelevant: true,
      reason: "The user asked to clear the current Canvas proposal context.",
      baseSurface: input.live.exists ? "Live" : input.selectedSurface,
      wantsOptions: false,
    };
  }

  const unsupported = unsupportedOptionLabel(message);
  if (unsupported) {
    return askUserResolution(
      input,
      `Canvas supports active comparison options A, B, and C; option ${unsupported} is outside that set.`,
      replacementQuestion(input, message, activeProposal),
    );
  }

  if (activeProposal) {
    if (isBuildSelectedRequest(normalized)) {
      const target = targetOptionId ?? selectedOptionId;
      return {
        action: "BUILD_SELECTED",
        canvasRelevant: true,
        reason: "The user is committing to the selected Canvas proposal.",
        baseSurface: activeProposal.selectedOptionId ?? input.selectedSurface,
        targetSurface: target ?? activeProposal.selectedOptionId ?? input.selectedSurface,
        targetOptionId: target ?? undefined,
        wantsOptions: false,
        backingPreference: activeProposal.backing,
        buildStrategy: activeProposal.buildStrategy,
      };
    }

    const addOrReplace = isAddOrReplaceOptionRequest(normalized);
    if (addOrReplace || targetOptionId) {
      const target =
        targetOptionId ??
        nextMissingOption(activeProposal) ??
        selectedOptionId ??
        firstProposalOption(activeProposal);
      if (!target || (isFullProposal(activeProposal) && !targetOptionId)) {
        return askUserResolution(
          input,
          "The active Canvas proposal already has A, B, and C.",
          replacementQuestion(input, message, activeProposal),
        );
      }
      return {
        action: "ADD_OPTION",
        canvasRelevant: true,
        reason: `The user wants Option ${target} added, refreshed, or replaced inside the current proposal set.`,
        baseSurface: activeProposal.selectedOptionId ?? input.selectedSurface,
        targetSurface: target,
        targetOptionId: target,
        sourceOptionId: sourceOptionId ?? selectedOptionId ?? undefined,
        wantsOptions: true,
        backingPreference: activeProposal.backing,
        buildStrategy: activeProposal.buildStrategy,
      };
    }

    if (
      isProposalRevisionRequest(normalized) ||
      input.selectedSurface !== "Live" ||
      marks.length > 0
    ) {
      const target = targetOptionId ?? selectedOptionId;
      return {
        action: "REVISE_PROPOSAL",
        canvasRelevant: true,
        reason: "The user is changing the active Canvas proposal, not Live.",
        baseSurface: activeProposal.selectedOptionId ?? input.selectedSurface,
        targetSurface: target ?? activeProposal.selectedOptionId ?? input.selectedSurface,
        targetOptionId: target ?? undefined,
        wantsOptions: false,
        backingPreference: activeProposal.backing,
        buildStrategy: activeProposal.buildStrategy,
      };
    }
  }

  if (isBuildSelectedRequest(normalized) || isDirectBuildRequest(normalized)) {
    return {
      action: input.live.exists ? "BUILD_LIVE_DIRECTLY" : "BUILD_LIVE_DIRECTLY",
      canvasRelevant: true,
      reason: "The user chose direct implementation rather than proposal review.",
      baseSurface: input.live.exists ? "Live" : input.selectedSurface,
      wantsOptions: false,
    };
  }

  const wantsOptions = isExplicitOptionsRequest(normalized);
  const wantsPreview = isExplicitPreviewRequest(normalized);
  const backingPreference = chooseBackingPreference(input, normalized, wantsOptions);

  if (!input.live.exists) {
    if (wantsOptions || wantsPreview || hasCanvasMention(message)) {
      return {
        action: "CREATE_PROPOSAL",
        canvasRelevant: true,
        reason: wantsOptions
          ? "The user explicitly asked for visual options before a Live app exists."
          : "The user explicitly asked for a Canvas preview before a Live app exists.",
        baseSurface: "Live",
        wantsOptions,
        backingPreference,
        buildStrategy: buildStrategyForProposalBacking(backingPreference),
      };
    }
    return askUserResolution(
      input,
      "There is no Live app yet and the user has not clearly chosen direct build or proposal review.",
      noLiveQuestion(message),
    );
  }

  if (!wantsOptions && !wantsPreview && isExploratoryVisualQuestion(normalized)) {
    return askUserResolution(
      input,
      "The user is exploring a visual decision and should choose the next Canvas path before artifacts or code are created.",
      liveChoiceQuestion(message),
    );
  }

  if (wantsOptions || wantsPreview || isSmallVisualProposalRequest(normalized)) {
    return {
      action: "CREATE_PROPOSAL",
      canvasRelevant: true,
      reason: wantsOptions
        ? "The user asked to compare proposal options."
        : "The user asked for a visual proposal based on Live.",
      baseSurface: "Live",
      wantsOptions,
      backingPreference,
      buildStrategy: buildStrategyForProposalBacking(backingPreference),
    };
  }

  if (isBroadVisualQuestion(normalized)) {
    return askUserResolution(
      input,
      "The visual request is broad enough that the user should choose direct build, one preview, or options.",
      liveChoiceQuestion(message),
    );
  }

  return {
    action: "CREATE_PROPOSAL",
    canvasRelevant: true,
    reason: "The request is visual and Live exists, so create one Canvas proposal by default.",
    baseSurface: "Live",
    wantsOptions: false,
    backingPreference,
    buildStrategy: buildStrategyForProposalBacking(backingPreference),
  };
}

export function canvasActionSummary(resolution: CanvasActionResolution) {
  return [
    `- Canvas action: ${resolution.action}`,
    `- Base surface: ${resolution.baseSurface}`,
    resolution.targetSurface
      ? `- Target surface: ${resolution.targetSurface}`
      : null,
    resolution.targetOptionId
      ? `- Target option: ${resolution.targetOptionId}`
      : null,
    resolution.sourceOptionId
      ? `- Source option: ${resolution.sourceOptionId}`
      : null,
    `- Wants options: ${resolution.wantsOptions ? "yes" : "no"}`,
    resolution.backingPreference
      ? `- Preferred proposal backing: ${resolution.backingPreference}`
      : null,
    resolution.buildStrategy
      ? `- Build selected strategy: ${resolution.buildStrategy}`
      : null,
    `- Resolver reason: ${resolution.reason}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function askUserResolution(
  input: CanvasActionResolverInput,
  reason: string,
  question: CanvasQuestion,
): CanvasActionResolution {
  return {
    action: "ASK_USER",
    canvasRelevant: true,
    reason,
    baseSurface: input.live.exists ? "Live" : input.selectedSurface,
    wantsOptions: false,
    backingPreference: questionBackingPreference(input),
    question,
  };
}

function questionBackingPreference(
  input: CanvasActionResolverInput,
): ProposalBacking {
  const activeProposal =
    input.activeProposalSet?.lifecycle === "active"
      ? input.activeProposalSet
      : null;
  if (activeProposal) return activeProposal.backing;
  const normalized = normalize(input.message);
  return chooseBackingPreference(input, normalized, isExplicitOptionsRequest(normalized));
}

function noLiveQuestion(message: string): CanvasQuestion {
  void message;
  return {
    title: "How should I start?",
    reason:
      "There is no Live app yet, so Canvas needs the user to choose direct build or visual proposal review.",
  };
}

function liveChoiceQuestion(message: string): CanvasQuestion {
  void message;
  return {
    title: "How should I show this?",
    reason:
      "The request touches the current app visually, but the safest next step depends on whether the user wants direct implementation or a preview first.",
  };
}

function replacementQuestion(
  input: CanvasActionResolverInput,
  message: string,
  activeProposal: CanvasProposalState | null,
): CanvasQuestion {
  void input;
  void message;
  void activeProposal;
  return {
    title: "Which proposal slot should change?",
    reason:
      "Canvas v2 can compare A, B, and C at once. Choose whether to replace one option or start a fresh proposal set.",
  };
}

function chooseBackingPreference(
  input: CanvasActionResolverInput,
  normalized: string,
  wantsOptions: boolean,
): ProposalBacking {
  if (!input.live.exists) return "code_backed_workspace";
  if (/\b(mockup|mockups|wireframe|wireframes|static html|standalone html)\b/.test(normalized)) {
    return /\bwireframe|wireframes\b/.test(normalized)
      ? "wireframe_artifact"
      : "mockup_artifact";
  }
  if (
    /\b(runnable\s+(?:option|options|proposal|proposals|candidate|candidates|app|apps)|proposal workspace|candidate app|new page|new route|new view|multi[-\s]?page|whole app|entire app|full redesign|navigation structure|multi[-\s]?step workflow|real routing|route and state)\b/.test(
      normalized,
    )
  ) {
    return "code_backed_workspace";
  }
  if (wantsOptions && isStructuralVisualRequest(normalized)) {
    return "code_backed_workspace";
  }
  return "live_dom_patch";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasCanvasMention(message: string) {
  return /(?:^|[^a-z0-9_])@?canvas(?:[^a-z0-9_]|$)/i.test(message);
}

function isVisualCanvasRequest(message: string) {
  const text = normalize(message);
  if (isNonVisualOperationalRequest(text)) return false;
  return (
    /\b(ui|ux|visual|app|site|product|dashboard|screen|page|view|layout|style|styling|navigation|nav|workflow|interaction|onboarding|empty state|placement|screenshot|mark|preview|previews|proposal|proposals|mockup|mockups|wireframe|wireframes|option|options|variant|variants|direction|directions|candidate|candidates|compare|show me|where should|put it|move it|make it smaller|make it larger|button|menu|panel|modal|drawer|popover|dialog|settings|toolbar|header|footer|card|table|list|filter|tab|sidebar|form)\b/.test(
      text,
    ) || /\b[abc]\/[abc](?:\/[abc])?\b/.test(text)
  );
}

function isNonVisualOperationalRequest(text: string) {
  return /\b(api|backend|server|database|schema|migration|cli|rust|go package|unit test|parser|protocol|auth token|rate limit|script|terminal|shell|powershell|bash)\b/.test(
    text,
  );
}

function isExplicitOptionsRequest(text: string) {
  return (
    /\b(?:show|create|give|make|generate|try|compare)\s+(?:me\s+)?(?:\d+(?:\s*-\s*\d+)?|two|three|2|3)?(?:\s+[a-z0-9-]+){0,4}\s+(?:options|directions|variants|proposals|candidates|mockups|wireframes|layouts|previews|concepts)\b/.test(
      text,
    ) ||
    /\b(?:a\/b|a\/b\/c|abc|a,\s*b,?\s*(?:and\s+)?c)\b/.test(text) ||
    /\b(?:two|three|2|3)\s+(?:(?:different|runnable|reviewable|visual|separate)\s+){0,4}(?:options|directions|variants|proposals|candidates|layouts|previews|mockups|wireframes)\b/.test(
      text,
    )
  );
}

function isExplicitPreviewRequest(text: string) {
  return (
    /\b(?:view|see|preview|review|show)\s+(?:it\s+)?first\b/.test(text) ||
    /\b(?:show|create|give|make|generate)\s+(?:me\s+)?(?:(?:one|1|a|single)\s+)?(?:quick\s+)?(?:review\s+)?preview\b/.test(
      text,
    ) ||
    /\bbefore\s+(?:implementation|implementing|building|changing)\b/.test(text)
  );
}

function isSmallVisualProposalRequest(text: string) {
  if (
    isBroadVisualQuestion(text) ||
    isExplicitOptionsRequest(text) ||
    isExploratoryVisualQuestion(text)
  ) {
    return false;
  }
  if (isStructuralVisualRequest(text)) return false;
  return (
    /\b(propose|preview|show|place|where|somewhere|button|label|copy|menu|modal|drawer|panel|sheet|popover|toolbar|header|footer|settings|filter|tab|card|move|resize|align|hide|show|change|replace|make)\b/.test(
      text,
    ) && text.length <= 260
  );
}

function isBroadVisualQuestion(text: string) {
  return /\b(how should|how would|what(?:'s| is) the best|where should|what workflow|fit into|fit in|best workflow|best way|which direction|explore|compare directions)\b/.test(
    text,
  );
}

function isExploratoryVisualQuestion(text: string) {
  if (isExplicitOptionsRequest(text) || isExplicitPreviewRequest(text)) return false;
  if (!isVisualCanvasRequest(text)) return false;
  if (/\b(?:can|could|should|would|do|does|is|are|what|where|which|how|why)\b/.test(text) && text.includes("?")) {
    return true;
  }
  return /\b(?:show me|tell me|help me|roughly|maybe|not sure|thinking about|trying to decide|what(?:'s| is)|where|which|how)\b/.test(
    text,
  );
}

function isStructuralVisualRequest(text: string) {
  return /\b(new page|new route|new view|multi[-\s]?page|whole app|entire app|full redesign|redesign the whole|redesign the entire|navigation structure|full dashboard|multi[-\s]?step workflow|real routing|route and state)\b/.test(
    text,
  );
}

function isDirectBuildRequest(text: string) {
  if (/\b(?:looking|thinking|considering|planning)\s+to\s+implement\b/.test(text)) {
    return false;
  }
  if (/\b(show|preview|review|mockup|wireframe|option|proposal|where should|somewhere)\b/.test(text)) {
    return false;
  }
  return /\b(build|implement|change|apply|do)\s+(?:it\s+)?(?:directly|now|right away)\b/.test(
    text,
  );
}

function isBuildSelectedRequest(text: string) {
  if (/\b(?:looking|thinking|considering|planning)\s+to\s+implement\b/.test(text)) {
    return false;
  }
  return (
    /\bbuild\s+(?:selected|this|that|it|option\s+[abc]|on\s+option\s+[abc]|the\s+selected)\b/.test(
      text,
    ) ||
    /\bbuild\s+on\s+(?:option\s+)?[abc]\b/.test(text) ||
    /\bapply\s+(?:this|that|it|option\s+[abc]|the\s+selected)\b/.test(text) ||
    /\bmake\s+(?:this|that|it|option\s+[abc]|the\s+selected)\s+real\b/.test(
      text,
    ) ||
    /\bimplement\s+(?:now|this|that|it|option\s+[abc]|the\s+selected|selected)\b/.test(
      text,
    ) ||
    /\buse\s+option\s+[abc]\b.*\bimplement\b/.test(text) ||
    /\bi\s+like\s+(?:this|that|it)\b.*\bimplement\b/.test(text) ||
    /\bplease\s+implement\s+(?:this|that|it|option\s+[abc])\b/.test(text)
  );
}

function isAddOrReplaceOptionRequest(text: string) {
  return /\b(add|create|new|another|additional|one more|replace|refresh|put it in|make it option)\b/.test(
    text,
  );
}

function isProposalRevisionRequest(text: string) {
  if (isBuildSelectedRequest(text)) return false;
  return /\b(revise|tweak|adjust|change|move|put|make|show me|instead|rather than|swap|replace|smaller|larger|higher|lower|top|bottom|left|right|there|this area|marked|mark)\b/.test(
    text,
  );
}

function isArchiveRequest(text: string) {
  return /\b(archive|dismiss|clear|reset)\s+(?:the\s+)?(?:canvas\s+)?(?:proposal|proposals|options|comparison)\b/.test(
    text,
  );
}

function requestedOptionId(message: string): CanvasOptionId | null {
  const target = requestedOptionLabel(message);
  return isCanvasOptionId(target) ? target : null;
}

function requestedOptionLabel(message: string): string | null {
  const matches = [
    ...message.matchAll(
      /\b(?:add|create|new|another|additional|one\s+more|make|as|called|label(?:ed)?|replace|refresh|put(?:\s+it)?\s+in)\s+(?:it\s+)?(?:an?\s+)?(?:option\s+)?([a-z])\b/gi,
    ),
  ];
  const last = matches[matches.length - 1]?.[1]?.toUpperCase();
  if (last) return last;
  const optionMatch = message.match(/\boption\s+([a-z])\b/i);
  return optionMatch?.[1]?.toUpperCase() ?? null;
}

function sourceOptionIdFromText(message: string): CanvasOptionId | null {
  const match = message.match(
    /\b(?:based\s+on|from|like|derive(?:d)?\s+from|using)\s+(?:option\s+)?([a-z])\b/i,
  );
  const value = match?.[1]?.toUpperCase();
  return isCanvasOptionId(value) ? value : null;
}

function unsupportedOptionLabel(message: string) {
  const optionMatches = [...message.matchAll(/\boption\s+([a-z])\b/gi)];
  return (
    optionMatches
      .map((match) => match[1]?.toUpperCase() ?? "")
      .find((label) => Boolean(label) && !isCanvasOptionId(label)) ?? null
  );
}

function isCanvasOptionId(value: string | null | undefined): value is CanvasOptionId {
  return value === "A" || value === "B" || value === "C";
}

function surfaceToOptionId(
  value: CanvasSurface | null | undefined,
): CanvasOptionId | null {
  return value === "A" || value === "B" || value === "C" ? value : null;
}

function firstProposalOption(
  proposal: CanvasProposalState | null | undefined,
): CanvasOptionId | null {
  const option = proposal?.options
    .map((candidate) => surfaceToOptionId(candidate.id))
    .find((id): id is CanvasOptionId => Boolean(id));
  return option ?? null;
}

function nextMissingOption(
  proposal: CanvasProposalState,
): CanvasOptionId | null {
  const existing = new Set(proposal.options.map((option) => option.id));
  return OPTION_IDS.find((id) => !existing.has(id)) ?? null;
}

function isFullProposal(proposal: CanvasProposalState) {
  const existing = new Set(proposal.options.map((option) => option.id));
  return OPTION_IDS.every((id) => existing.has(id));
}
