import {
  buildStrategyForProposalBacking,
  type BuildSelectedStrategy,
  type ProposalBacking,
  type ProposalLifecycle,
} from "./canvasProposalModel";

export type CanvasAction =
  | "ASK_USER"
  | "CREATE_DRAFT"
  | "BUILD_LIVE_DIRECTLY";

export type CanvasSurface = "Live" | "Draft";

export type CanvasWorkflowSurface = CanvasSurface | "none";

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
  source: "user_mark";
  surface: CanvasSurface;
};

export type CanvasActionResolverInput = {
  message: string;
  live: CanvasLiveState;
  selectedSurface: CanvasSurface;
  workflowLedger?: {
    authoritativeSurface: CanvasWorkflowSurface;
    selectedSurface: CanvasWorkflowSurface;
    activeWorkKind: string;
    draftNeedsAttention?: boolean;
  };
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
  wantsOptions: boolean;
  backingPreference?: ProposalBacking;
  buildStrategy?: BuildSelectedStrategy;
  question?: CanvasQuestion;
};

export const CANVAS_OPERATING_PROMPT = `You have access to Canvas, a visual collaboration surface for UI, UX, workflow, layout, and placement work.

Canvas has:
- Live Canvas: the real current app preview, with user marks.
- Draft Canvas: one reviewable feature change in the real app context, source-safe until the user chooses Build this.
- Agent Question Placeholder: a visible product question surface for asking the user what kind of visual path they want before implementation.

Use Canvas when the request involves:
- UI, UX, workflow, layout, styling, navigation, menus, panels, modals, empty states, onboarding, placement, screenshots, marks, previews, mockups, wireframes, or visual comparison;
- words like Canvas, @Canvas, preview, show me, where should, layout, workflow, mockup, wireframe, option, alternative, put it there, move it, make it smaller, or change this area.

If the user says Canvas, treat it as @Canvas even if it appears anywhere in the message.

Prefer one Draft for one existing-app visual change.
When the user asks for alternatives, express them as named Draft directions or ask which single Draft to create first. Do not expose lettered proposal lanes.

If there is no Live app and the user has not clearly chosen a path, ask a visible Canvas question before implementing.
If there is a Live app and the request is one feature or small visual change to see before implementation, create a Draft Canvas by reusing Live Canvas as much as possible.
Use Draft Canvas for preview-before-build work, including explicit alternatives. A Draft may have a product-facing name, but it is not a lettered lane.

If the user says "build it", send an implementation turn with selected Draft context when a Draft is active; otherwise build Live directly. Do not silently apply hidden state.
If the user asks to test, check, verify, or debug a Canvas surface, say which surface was tested, which URL/server was used, what data scope was touched (Live, copied, fabricated, or unknown), and whether source or data changed.

Every Draft must include:
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
  const explicitDraftTarget = isExplicitDraftTarget(normalized);
  const explicitLiveTarget = isExplicitLiveTarget(normalized);
  const explicitProposalTarget = isExplicitProposalTarget(normalized);
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
      action: "BUILD_LIVE_DIRECTLY",
      canvasRelevant: true,
      reason: "The user asked to clear stale Canvas context; P35 keeps Live/Draft only.",
      baseSurface: input.live.exists ? "Live" : input.selectedSurface,
      wantsOptions: false,
    };
  }

  if (
    explicitDraftTarget &&
    !isBuildSelectedRequest(normalized) &&
    !explicitProposalTarget &&
    !/\b(?:mockup|mockups|wireframe|wireframes)\b/.test(normalized)
  ) {
    return {
      action: "CREATE_DRAFT",
      canvasRelevant: true,
      reason:
        "The user explicitly targeted Draft, so stale proposal context must not capture this turn.",
      baseSurface: "Live",
      targetSurface: "Live",
      wantsOptions: false,
    };
  }

  if (activeProposal) {
    if (explicitLiveTarget || isBuildSelectedRequest(normalized)) {
      return {
        action: "BUILD_LIVE_DIRECTLY",
        canvasRelevant: true,
        reason:
          "Legacy proposal context is present, but P34 routes commits and explicit Live work to Live instead of proposal lanes.",
        baseSurface: "Live",
        wantsOptions: false,
      };
    }

    if (
      isVerificationRequest(normalized) &&
      input.workflowLedger?.authoritativeSurface === "Live" &&
      !explicitProposalTarget
    ) {
      return {
        action: "BUILD_LIVE_DIRECTLY",
        canvasRelevant: true,
        reason:
          "The user asked to verify or debug the authoritative Live surface, not a legacy proposal lane.",
        baseSurface: "Live",
        wantsOptions: false,
      };
    }

    return {
      action: "CREATE_DRAFT",
      canvasRelevant: true,
      reason:
        "Legacy proposal context is present, but P34 uses a Draft for reviewable visual follow-up work.",
      baseSurface: "Live",
      targetSurface: "Live",
      wantsOptions: false,
    };
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

  const wantsPreview = isExplicitPreviewRequest(normalized);
  const wantsOptions = isExplicitOptionsRequest(normalized);
  const backingPreference = chooseBackingPreference(input, normalized, wantsOptions);

  if (!input.live.exists) {
    if (wantsOptions || wantsPreview || hasCanvasMention(message)) {
      return askUserResolution(
        input,
        "There is no Live app yet, so Canvas should ask whether to build the first Live version now or start with a simpler product direction.",
        noLiveQuestion(message),
      );
    }
    return askUserResolution(
      input,
      "There is no Live app yet and the user has not clearly chosen direct build or Draft review.",
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

  if ((wantsPreview && isFeatureDraftRequest(normalized)) || wantsOptions) {
    return {
      action: "CREATE_DRAFT",
      canvasRelevant: true,
      reason:
        wantsOptions
          ? "The user asked for alternatives; P34 routes alternatives into named Draft directions instead of lettered proposal lanes."
          : "The user asked to see one feature or workflow inside the existing app before implementation.",
      baseSurface: "Live",
      wantsOptions: false,
    };
  }

  if (wantsPreview || isSmallVisualProposalRequest(normalized)) {
    return {
      action: "CREATE_DRAFT",
      canvasRelevant: true,
      reason: "The user asked for a visual preview based on Live, so P34 creates a Draft.",
      baseSurface: "Live",
      wantsOptions: false,
    };
  }

  if (isBroadVisualQuestion(normalized)) {
    return askUserResolution(
      input,
      "The visual request is broad enough that the user should choose direct build or a Draft first.",
      liveChoiceQuestion(message),
    );
  }

  return {
    action: "CREATE_DRAFT",
    canvasRelevant: true,
    reason: "The request is visual and Live exists, so create one Draft by default.",
    baseSurface: "Live",
    wantsOptions: false,
  };
}

export function canvasActionSummary(resolution: CanvasActionResolution) {
  return [
    `- Canvas action: ${resolution.action}`,
    `- Base surface: ${resolution.baseSurface}`,
    resolution.targetSurface
      ? `- Target surface: ${resolution.targetSurface}`
      : null,
    `- Wants options: ${resolution.wantsOptions ? "yes" : "no"}`,
    resolution.backingPreference
      ? `- Preferred proposal backing: ${resolution.backingPreference}`
      : null,
    resolution.buildStrategy
      ? `- Build strategy: ${resolution.buildStrategy}`
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
    title: "Which draft should change?",
    reason:
      "Canvas now uses Drafts for preview work. Choose whether to revise the current Draft or start a fresh named Draft.",
  };
}

function targetConflictQuestion(
  input: CanvasActionResolverInput,
  message: string,
  activeProposal: CanvasProposalState | null,
): CanvasQuestion {
  void input;
  void message;
  void activeProposal;
  return {
    title: "Which surface should change?",
    reason:
      "The request mentions Live and an old proposal. Choose whether to update Live or move the idea into a Draft.",
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

function isFeatureDraftRequest(text: string) {
  if (
    /\b(?:mockup|mockups|wireframe|wireframes|a\/b|options?|directions|variants|proposal|proposals)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /\b(?:one|1|single)\s+(?:quick\s+)?(?:review\s+)?preview\b/.test(text) &&
    /\b(?:placement|button|label|copy|where|somewhere|move|resize|align|header|footer|toolbar|menu)\b/.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /\bshow\s+me\b.*\b(?:feature|flow|workflow|experience|mode|onboarding|checkout|upload|import|export|notification)\b/.test(
      text,
    ) ||
    /\b(?:show|preview|draft|try|explore)\b.*\b(?:feature|flow|workflow|experience|mode|onboarding|checkout|upload|import|export|notification)\b/.test(
      text,
    ) ||
    /\b(?:how|what)\b.*\b(?:would|could|should)\b.*\b(?:work|look|feel)\b/.test(
      text,
    ) ||
    /\b(?:show|preview|draft|try|explore)\b.*\b(?:before|first)\b/.test(text)
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

function isExplicitDraftTarget(text: string) {
  return /\b(?:draft|feature\s+draft|visuali[sz]e\s+first|visuali[sz]e\s+in\s+draft|before\s+implementation|before\s+implementing|show\s+me\s+the\s+workflow\s+first)\b/.test(
    text,
  );
}

function isExplicitLiveTarget(text: string) {
  return /\b(?:live|working\s+app|real\s+app|main\s+files|project\s+folder|source\s+files|directly\s+to\s+live|inside\s+the\s+project|make\s+it\s+real|production|finished\s+product)\b/.test(
    text,
  );
}

function isExplicitProposalTarget(text: string) {
  return /\b(?:option\s+[abc]|proposal|proposals|compare|comparison|a\/b|a\/b\/c)\b/.test(
    text,
  );
}

function isVerificationRequest(text: string) {
  return /\b(?:check|test|verify|debug|try\s+the|walk\s+through|run\s+through|does\s+it\s+work|workflow\s+works|add\s+(?:a\s+)?test|smoke\s+test)\b/.test(
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

function isArchiveRequest(text: string) {
  return /\b(archive|dismiss|clear|reset)\s+(?:the\s+)?(?:canvas\s+)?(?:proposal|proposals|options|comparison)\b/.test(
    text,
  );
}
