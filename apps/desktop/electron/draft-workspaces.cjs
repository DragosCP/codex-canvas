const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  applyProposalWorkspace,
  diffProposalWorkspace,
  prepareProposalWorkspaces,
} = require("./proposal-workspaces.cjs");

const fsp = fs.promises;

const REGISTRY_FILE = "registry.json";
const DRAFT_STATUS = new Set(["active", "parked", "built", "discarded"]);
const draftRegistryWriteQueues = new Map();

async function prepareDraftWorkspace(args) {
  const projectPath = path.resolve(String(args.projectPath ?? ""));
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const name = cleanText(args.name, 80) || "Feature draft";
  const slug = cleanSegment(args.slug || name, "feature-draft").toLowerCase();
  const draftId = cleanSegment(
    args.draftId || `draft-${slug}-${shortHash(`${projectPath}:${name}:${Date.now()}`)}`,
    "draft",
  );
  const now = Date.now();
  const backing = await prepareProposalWorkspaces({
    cacheRoot: backingCacheRoot(cacheRoot),
    projectPath,
    proposalSetId: draftId,
    optionIds: ["A"],
    reuseDependencies: true,
  });
  const option = backing.options[0];
  if (!option?.workspacePath) {
    throw new Error("Could not prepare a draft workspace.");
  }

  const briefPath = draftBriefPath(projectPath, slug);
  const record = normalizeDraftRecord({
    version: 1,
    draftId,
    registryId: draftRegistryId(projectPath, draftId),
    projectPath,
    threadId: cleanText(args.threadId, 120) || null,
    name,
    slug,
    status: "active",
    rootPath: backing.rootPath,
    workspacePath: option.workspacePath,
    previewOwnerId: `draft:${draftRegistryId(projectPath, draftId)}`,
    affectedRoutes: stringList(args.affectedRoutes),
    mockAssumptions: stringList(args.mockAssumptions),
    briefPath,
    createdAt: now,
    updatedAt: now,
  });
  await upsertDraftRecord(cacheRoot, record);
  await writeDraftBrief({
    projectPath,
    name,
    slug,
    status: record.status,
    goal: args.goal || args.originalPrompt || name,
    currentSummary: args.currentSummary || "",
    affectedRoutes: record.affectedRoutes,
    mockAssumptions: record.mockAssumptions,
    approvedDecisions: stringList(args.approvedDecisions),
    rejectedIdeas: stringList(args.rejectedIdeas),
    openQuestions: stringList(args.openQuestions),
    buildPlan: stringList(args.buildPlan),
    risks: stringList(args.risks),
  });

  return publicDraftRecord(record);
}

async function diffDraftWorkspace(args) {
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const draftId = cleanSegment(args.draftId, "");
  if (!draftId) throw new Error("Draft id is required.");
  const record = await registeredDraftRecord(cacheRoot, draftId, {
    projectPath: args.projectPath,
  });
  const diff = await diffProposalWorkspace(record.workspacePath);
  return {
    draftId: record.draftId,
    registryId: record.registryId,
    status: record.status,
    workspacePath: record.workspacePath,
    previewOwnerId: record.previewOwnerId,
    changedFiles: diff.changedFiles,
  };
}

async function listDraftWorkspaces(args) {
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const projectPath = args.projectPath ? path.resolve(String(args.projectPath)) : "";
  const registry = await readDraftRegistry(cacheRoot);
  return Object.values(registry.drafts)
    .map(normalizeDraftRecord)
    .filter(Boolean)
    .filter((record) => !projectPath || samePath(record.projectPath, projectPath))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(publicDraftRecord);
}

async function applyDraftWorkspace(args) {
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const draftId = cleanSegment(args.draftId, "");
  const projectPath = path.resolve(String(args.projectPath ?? ""));
  if (!draftId) throw new Error("Draft id is required.");
  const record = await registeredDraftRecord(cacheRoot, draftId, {
    projectPath,
  });
  if (record.status !== "active") {
    throw new Error("Draft must be active before it can be built.");
  }
  const result = await applyProposalWorkspace({
    projectPath,
    workspacePath: record.workspacePath,
  });
  if (result?.ok) {
    const next = normalizeDraftRecord({
      ...record,
      status: "built",
      updatedAt: Date.now(),
    });
    await upsertDraftRecord(cacheRoot, next);
    return {
      ...result,
      draftId: next.draftId,
      registryId: next.registryId,
      status: next.status,
      changedFiles: result.changedFiles ?? [],
    };
  }
  return {
    ok: false,
    draftId: record.draftId,
    registryId: record.registryId,
    status: record.status,
    changedFiles: result?.changedFiles ?? [],
    conflicts: result?.conflicts ?? [],
  };
}

async function updateDraftLifecycle(args) {
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const draftId = cleanSegment(args.draftId, "");
  const status = normalizeDraftStatus(args.status, null);
  if (!draftId) throw new Error("Draft id is required.");
  if (!status) throw new Error("Draft status is not valid.");
  const record = await registeredDraftRecord(cacheRoot, draftId, {
    projectPath: args.projectPath,
  });
  const next = normalizeDraftRecord({
    ...record,
    status,
    affectedRoutes:
      args.affectedRoutes == null
        ? record.affectedRoutes
        : stringList(args.affectedRoutes),
    mockAssumptions:
      args.mockAssumptions == null
        ? record.mockAssumptions
        : stringList(args.mockAssumptions),
    updatedAt: Date.now(),
  });
  await upsertDraftRecord(cacheRoot, next);
  if (args.updateBrief !== false) {
    await writeDraftBrief({
      projectPath: next.projectPath,
      name: next.name,
      slug: next.slug,
      status: next.status,
      goal: args.goal || next.name,
      currentSummary: args.currentSummary || "",
      affectedRoutes: next.affectedRoutes,
      mockAssumptions: next.mockAssumptions,
      approvedDecisions: stringList(args.approvedDecisions),
      rejectedIdeas: stringList(args.rejectedIdeas),
      openQuestions: stringList(args.openQuestions),
      buildPlan: stringList(args.buildPlan),
      risks: stringList(args.risks),
    });
  }
  return publicDraftRecord(next);
}

async function updateDraftBrief(args) {
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const draftId = cleanSegment(args.draftId, "");
  if (!draftId) throw new Error("Draft id is required.");
  const record = await registeredDraftRecord(cacheRoot, draftId, {
    projectPath: args.projectPath,
  });
  await writeDraftBrief({
    projectPath: record.projectPath,
    name: record.name,
    slug: record.slug,
    status: record.status,
    goal: args.goal || record.name,
    currentSummary: args.currentSummary || "",
    affectedRoutes:
      args.affectedRoutes == null
        ? record.affectedRoutes
        : stringList(args.affectedRoutes),
    mockAssumptions:
      args.mockAssumptions == null
        ? record.mockAssumptions
        : stringList(args.mockAssumptions),
    approvedDecisions: stringList(args.approvedDecisions),
    rejectedIdeas: stringList(args.rejectedIdeas),
    openQuestions: stringList(args.openQuestions),
    buildPlan: stringList(args.buildPlan),
    risks: stringList(args.risks),
  });
  return publicDraftRecord(record);
}

async function writeDraftBrief(args) {
  const projectPath = path.resolve(String(args.projectPath ?? ""));
  const slug = cleanSegment(args.slug || args.name, "feature-draft").toLowerCase();
  const briefPath = draftBriefPath(projectPath, slug);
  const status = normalizeDraftStatus(args.status, "active");
  const lines = [
    `# Draft: ${safeBriefText(args.name || "Feature draft")}`,
    "",
    `Status: ${status}`,
    "",
    "## Feature Goal",
    safeBriefText(args.goal || args.name || "Describe the feature goal."),
    "",
    "## Current Draft",
    safeBriefText(args.currentSummary || "Draft workspace prepared; source remains unchanged until Build this."),
    "",
    listSection("Affected Routes / Screens", args.affectedRoutes),
    listSection("Mock Assumptions", args.mockAssumptions),
    listSection("Approved Decisions", args.approvedDecisions),
    listSection("Rejected Ideas", args.rejectedIdeas),
    listSection("Open Questions", args.openQuestions),
    listSection("Build Plan", args.buildPlan),
    listSection("Risks And Follow-Up", args.risks),
  ];
  await fsp.mkdir(path.dirname(briefPath), { recursive: true });
  await fsp.writeFile(briefPath, `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`, "utf8");
  return { briefPath };
}

async function readDraftRegistry(cacheRoot) {
  const value = await readJsonIfExists(registryPath(cacheRoot));
  if (!value || value.version !== 1 || !value.drafts || typeof value.drafts !== "object") {
    return { version: 1, updatedAt: Date.now(), drafts: {} };
  }
  const drafts = {};
  for (const [draftId, raw] of Object.entries(value.drafts)) {
    const normalized = normalizeDraftRecord(raw);
    if (!normalized) continue;
    drafts[draftId] = normalized;
  }
  return {
    version: 1,
    updatedAt: Number(value.updatedAt) || Date.now(),
    drafts,
  };
}

async function writeDraftRegistry(cacheRoot, registry) {
  await writeJson(registryPath(cacheRoot), {
    version: 1,
    updatedAt: Date.now(),
    drafts: registry.drafts || {},
  });
}

async function upsertDraftRecord(cacheRoot, record) {
  return withDraftRegistryWriteQueue(cacheRoot, async () => {
    const registry = await readDraftRegistry(cacheRoot);
    const normalized = normalizeDraftRecord(record);
    if (!normalized) throw new Error("Draft workspace record is not valid.");
    registry.drafts[normalized.draftId] = normalized;
    await writeDraftRegistry(cacheRoot, registry);
    return normalized;
  });
}

async function registeredDraftRecord(cacheRoot, draftId, options = {}) {
  const registry = await readDraftRegistry(cacheRoot);
  const record = normalizeDraftRecord(registry.drafts[draftId]);
  if (!record) throw new Error("Draft workspace is not registered.");
  if (options.projectPath && !samePath(options.projectPath, record.projectPath)) {
    throw new Error("Draft workspace belongs to another project.");
  }
  if (
    !pathInsideOrEqual(record.workspacePath, record.rootPath) ||
    !fs.existsSync(record.workspacePath)
  ) {
    throw new Error("Draft workspace is outside its registered bounds.");
  }
  return record;
}

function normalizeDraftRecord(value) {
  if (!value || typeof value !== "object") return null;
  const projectPath = path.resolve(String(value.projectPath ?? ""));
  const rootPath = path.resolve(String(value.rootPath ?? ""));
  const workspacePath = path.resolve(String(value.workspacePath ?? ""));
  const draftId = cleanSegment(value.draftId, "");
  if (!draftId || !projectPath || !rootPath || !workspacePath) return null;
  const slug = cleanSegment(value.slug || value.name, "feature-draft").toLowerCase();
  const registryId = String(value.registryId || draftRegistryId(projectPath, draftId));
  return {
    version: 1,
    draftId,
    registryId,
    projectPath,
    threadId: cleanText(value.threadId, 120) || null,
    name: cleanText(value.name, 80) || "Feature draft",
    slug,
    status: normalizeDraftStatus(value.status, "active"),
    rootPath,
    workspacePath,
    previewOwnerId: String(value.previewOwnerId || `draft:${registryId}`),
    affectedRoutes: stringList(value.affectedRoutes),
    mockAssumptions: stringList(value.mockAssumptions),
    briefPath: String(value.briefPath || draftBriefPath(projectPath, slug)),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
}

function publicDraftRecord(record) {
  return { ...record };
}

function withDraftRegistryWriteQueue(cacheRoot, task) {
  const key = path.resolve(String(cacheRoot ?? ""));
  const previous = draftRegistryWriteQueues.get(key) || Promise.resolve();
  const run = previous.catch(() => null).then(task);
  const tail = run.catch(() => null);
  draftRegistryWriteQueues.set(key, tail);
  return run.finally(() => {
    if (draftRegistryWriteQueues.get(key) === tail) {
      draftRegistryWriteQueues.delete(key);
    }
  });
}

function listSection(title, values) {
  const items = stringList(values).map(safeBriefText).filter(Boolean);
  if (items.length === 0) {
    return [`## ${title}`, "- None recorded."].join("\n");
  }
  return [`## ${title}`, ...items.map((item) => `- ${item}`)].join("\n");
}

function safeBriefText(value) {
  const text = cleanText(value, 1000);
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, "[omitted internal detail]")
    .replace(/\b(?:registryId|previewOwnerId|workspacePath|rootPath|draftId)\s*[:=]\s*\S+/gi, "[omitted internal detail]")
    .replace(/\b(?:proposal-workspaces|draft-workspaces|\.codex-proposal)\b[^\s]*/gi, "[omitted internal detail]")
    .replace(/[A-Za-z]:[\\/][^\s)]+/g, "[omitted internal detail]")
    .replace(/\/(?:Users|home|tmp|var|mnt)\/[^\s)]+/g, "[omitted internal detail]")
    .replace(/\b[\w./-]+\.(?:ts|tsx|js|jsx|css|html|json)\b/g, "[implementation file]")
    .replace(
      /(?:#[A-Za-z][\w-]*|\.[A-Za-z][\w-]*|\[data-[^\]]+\]|xpath=\S+|css=\S+)/g,
      "[omitted selector]",
    )
    .replace(/\b(?:x|y|width|height|rect|coordinates?)\s*[:=]\s*[-\d., ]+/gi, "[omitted coordinates]")
    .replace(/\s+/g, " ")
    .trim();
}

function stringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item, 1000)).filter(Boolean);
  }
  const cleaned = cleanText(value, 1000);
  return cleaned ? [cleaned] : [];
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trimEnd()}...`
    : cleaned;
}

function normalizeDraftStatus(value, fallback) {
  return DRAFT_STATUS.has(value) ? value : fallback;
}

function cleanSegment(value, fallback) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function draftBriefPath(projectPath, slug) {
  return path.join(path.resolve(projectPath), ".codex", "drafts", slug, "brief.md");
}

function backingCacheRoot(cacheRoot) {
  return path.join(path.resolve(cacheRoot), "workspaces");
}

function registryPath(cacheRoot) {
  return path.join(path.resolve(cacheRoot), REGISTRY_FILE);
}

function draftRegistryId(projectPath, draftId) {
  return `${shortHash(path.resolve(projectPath).toLowerCase())}:${draftId}`;
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    return null;
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pathInsideOrEqual(candidate, parentDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(candidate));
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left, right) {
  return path.resolve(String(left ?? "")).toLowerCase() ===
    path.resolve(String(right ?? "")).toLowerCase();
}

module.exports = {
  applyDraftWorkspace,
  diffDraftWorkspace,
  listDraftWorkspaces,
  prepareDraftWorkspace,
  updateDraftBrief,
  updateDraftLifecycle,
  _test: {
    readDraftRegistry,
    safeBriefText,
    writeDraftRegistry,
  },
};
