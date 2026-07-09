const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const fsp = fs.promises;

const META_DIR = ".codex-proposal";
const BASELINE_FILE = "baseline.json";
const DEPENDENCY_REUSE_FILE = "dependency-reuse.json";
const SET_FILE = "proposal-set.json";
const REGISTRY_FILE = "registry.json";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_OPTIONS_PER_SET = 3;
const MAX_SETS_PER_PROJECT = 12;
const MAX_SET_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const proposalRegistryWriteQueues = new Map();
const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  META_DIR,
]);
const IGNORED_FILES = new Set([
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const IGNORED_RELATIVE_FILE_PATTERNS = [
  /^logs\/(?:draft|proposal|preview|vite)[^/]*(?:\.(?:out|err))?\.log$/i,
];
const DEPENDENCY_MANIFEST_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".class",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".exe",
  ".gif",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".psd",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".ttf",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
]);

async function prepareProposalWorkspaces(args) {
  const projectPath = path.resolve(String(args.projectPath ?? ""));
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const proposalSetId = cleanSegment(args.proposalSetId, "proposal");
  const optionIds = normalizeOptionIds(args.optionIds);
  const rootPath = proposalSetRoot(cacheRoot, projectPath, proposalSetId);

  await fsp.rm(rootPath, { recursive: true, force: true });
  await fsp.mkdir(rootPath, { recursive: true });

  const options = [];
  for (const optionId of optionIds) {
    const workspacePath = path.join(rootPath, optionId);
    await copyProject(projectPath, workspacePath);
    if (args.reuseDependencies) {
      await recordReusableDependencies(projectPath, workspacePath);
    }
    await writeWorkspaceBaseline(workspacePath, {
      projectPath,
      proposalSetId,
      optionId,
    });
    options.push({
      id: optionId,
      workspacePath,
      previewOwnerId: previewOwnerId(projectPath, proposalSetId, optionId),
    });
  }

  const now = Date.now();
  const registryId = registrySetId(projectPath, proposalSetId);
  const setRecord = {
    version: 1,
    registryId,
    projectPath,
    proposalSetId,
    optionIds,
    rootPath,
    options,
    createdAt: now,
    updatedAt: now,
  };

  await writeJson(path.join(rootPath, SET_FILE), setRecord);
  await upsertRegistrySet(cacheRoot, setRecord);
  await cleanupProposalRegistry(cacheRoot);

  return { proposalSetId, registryId, rootPath, options };
}

async function addProposalWorkspaceOption(args) {
  const projectPath = path.resolve(String(args.projectPath ?? ""));
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const proposalSetId = cleanSegment(args.proposalSetId, "proposal");
  const optionId = normalizeOptionId(args.optionId);
  const rootPath = proposalSetRoot(cacheRoot, projectPath, proposalSetId);
  const workspacePath = path.join(rootPath, optionId);
  const sourceWorkspacePath = args.sourceWorkspacePath
    ? path.resolve(String(args.sourceWorkspacePath))
    : "";

  await fsp.mkdir(rootPath, { recursive: true });
  await fsp.rm(workspacePath, { recursive: true, force: true });
  if (
    sourceWorkspacePath &&
    path.relative(rootPath, sourceWorkspacePath) &&
    !path.relative(rootPath, sourceWorkspacePath).startsWith("..") &&
    !path.isAbsolute(path.relative(rootPath, sourceWorkspacePath)) &&
    fs.existsSync(sourceWorkspacePath)
  ) {
    await copyDirectory(sourceWorkspacePath, workspacePath);
  } else {
    await copyProject(projectPath, workspacePath);
  }

  await writeWorkspaceBaselineFromProject(projectPath, workspacePath, {
    projectPath,
    proposalSetId,
    optionId,
  });

  const setPath = path.join(rootPath, SET_FILE);
  const existingSet = await readJsonIfExists(setPath);
  const existingOptionIds = Array.isArray(existingSet?.optionIds)
    ? existingSet.optionIds.map(String)
    : [];
  const optionIds = normalizeOptionIds([...existingOptionIds, optionId]);
  if (optionIds.length > MAX_OPTIONS_PER_SET) {
    throw new Error("Proposal workspace sets support at most A, B, and C.");
  }
  const existingOptions = Array.isArray(existingSet?.options)
    ? existingSet.options.filter(Boolean)
    : [];
  const nextOption = {
    id: optionId,
    workspacePath,
    previewOwnerId: previewOwnerId(projectPath, proposalSetId, optionId),
  };
  const options = [
    ...existingOptions.filter((option) => option?.id !== optionId),
    nextOption,
  ]
    .filter((option) => optionIds.includes(option.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const registryId = registrySetId(projectPath, proposalSetId);
  const setRecord = {
    version: 1,
    registryId,
    projectPath,
    proposalSetId,
    optionIds,
    rootPath,
    options,
    createdAt: Number(existingSet?.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
  await writeJson(setPath, {
    ...setRecord,
  });
  await upsertRegistrySet(cacheRoot, setRecord);

  return {
    proposalSetId,
    registryId,
    rootPath,
    options: [nextOption],
  };
}

async function diffProposalWorkspace(workspacePath) {
  const workspaceRoot = path.resolve(String(workspacePath ?? ""));
  const baseline = await readWorkspaceBaseline(workspaceRoot);
  const registered = await assertRegisteredWorkspace(workspaceRoot, {
    baseline,
  });
  const current = await snapshotFiles(workspaceRoot);
  const changes = [];

  for (const [relativePath, currentFile] of current.entries()) {
    const baseFile = baseline.files[relativePath];
    if (!baseFile) {
      changes.push(changeRecord("created", relativePath, currentFile));
      continue;
    }
    if (baseFile.hash !== currentFile.hash) {
      changes.push(changeRecord("updated", relativePath, currentFile));
    }
  }

  for (const [relativePath, baseFile] of Object.entries(baseline.files)) {
    if (!current.has(relativePath)) {
      changes.push(changeRecord("deleted", relativePath, baseFile));
    }
  }

  return {
    proposalSetId: baseline.proposalSetId,
    registryId: registered.set.registryId,
    optionId: baseline.optionId,
    workspacePath: workspaceRoot,
    previewOwnerId: registered.option.previewOwnerId,
    changedFiles: changes.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

async function applyProposalWorkspace(args) {
  const projectRoot = path.resolve(String(args.projectPath ?? ""));
  const workspaceRoot = path.resolve(String(args.workspacePath ?? ""));
  const baseline = await readWorkspaceBaseline(workspaceRoot);
  await assertRegisteredWorkspace(workspaceRoot, {
    baseline,
    projectPath: projectRoot,
  });
  const diff = await diffProposalWorkspace(workspaceRoot);
  const conflicts = [];

  for (const change of diff.changedFiles) {
    const targetPath = path.join(projectRoot, change.path);
    const baselineFile = baseline.files[change.path] ?? null;
    if (change.kind === "created") {
      if (fs.existsSync(targetPath)) {
        conflicts.push({
          path: change.path,
          reason: "Target file already exists in the live project.",
        });
      }
      continue;
    }
    if (!baselineFile) continue;
    const liveHash = await fileHashIfExists(targetPath);
    if (liveHash !== baselineFile.hash) {
      conflicts.push({
        path: change.path,
        reason:
          change.kind === "deleted"
            ? "Live file changed since the proposal was created."
            : "Live file changed since the proposal was created.",
      });
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      changedFiles: diff.changedFiles,
      conflicts,
    };
  }

  for (const change of diff.changedFiles) {
    const targetPath = path.join(projectRoot, change.path);
    if (change.kind === "deleted") {
      await fsp.rm(targetPath, { force: true });
      continue;
    }
    const sourcePath = path.join(workspaceRoot, change.path);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.copyFile(sourcePath, targetPath);
  }

  return {
    ok: true,
    changedFiles: diff.changedFiles,
    conflicts: [],
  };
}

async function writeWorkspaceBaseline(workspacePath, meta) {
  const files = Object.fromEntries(await snapshotFiles(workspacePath));
  await writeWorkspaceBaselineFiles(workspacePath, meta, files);
}

async function writeWorkspaceBaselineFromProject(projectPath, workspacePath, meta) {
  const files = Object.fromEntries(await snapshotFiles(projectPath));
  await writeWorkspaceBaselineFiles(workspacePath, meta, files);
}

async function writeWorkspaceBaselineFiles(workspacePath, meta, files) {
  await writeJson(path.join(workspacePath, META_DIR, BASELINE_FILE), {
    version: 1,
    projectPath: meta.projectPath,
    proposalSetId: meta.proposalSetId,
    optionId: meta.optionId,
    createdAt: Date.now(),
    files,
  });
}

async function readWorkspaceBaseline(workspacePath) {
  const baselinePath = path.join(workspacePath, META_DIR, BASELINE_FILE);
  const raw = JSON.parse(await fsp.readFile(baselinePath, "utf8"));
  if (!raw || raw.version !== 1 || !raw.proposalSetId || !raw.optionId) {
    throw new Error("Proposal workspace baseline is not valid.");
  }
  return {
    ...raw,
    files:
      raw.files && typeof raw.files === "object" && !Array.isArray(raw.files)
        ? raw.files
        : {},
  };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    return null;
  }
}

async function copyProject(sourceRoot, targetRoot) {
  await fsp.mkdir(targetRoot, { recursive: true });
  if (!fs.existsSync(sourceRoot)) return;
  await copyDirectory(sourceRoot, targetRoot);
}

async function recordReusableDependencies(projectPath, workspacePath) {
  const sourcePath = path.join(projectPath, "node_modules");
  const targetPath = path.join(workspacePath, "node_modules");
  if (!(await directoryExists(sourcePath)) || (await pathExists(targetPath))) {
    return null;
  }

  const metadata = {
    version: 1,
    mode: "project-link-pending",
    fingerprint: await dependencyFingerprint(projectPath),
    recordedAt: Date.now(),
  };
  await writeJson(path.join(workspacePath, META_DIR, DEPENDENCY_REUSE_FILE), metadata);
  return metadata;
}

async function ensurePreviewDependencyReuse(workspacePath) {
  const workspaceRoot = path.resolve(String(workspacePath ?? ""));
  const metadataPath = path.join(workspaceRoot, META_DIR, DEPENDENCY_REUSE_FILE);
  const metadata = await readJsonIfExists(metadataPath);
  if (!metadata || metadata.version !== 1) {
    return { status: "skipped", reason: "No dependency reuse metadata." };
  }
  const targetPath = path.join(workspaceRoot, "node_modules");
  if (await pathExists(targetPath)) {
    return { status: "ready", mode: "existing" };
  }

  const baseline = await readWorkspaceBaseline(workspaceRoot);
  const sourcePath = path.join(baseline.projectPath, "node_modules");
  if (!(await directoryExists(sourcePath))) {
    return { status: "skipped", reason: "Source dependencies are not installed." };
  }
  const currentFingerprint = await dependencyFingerprint(baseline.projectPath);
  if (metadata.fingerprint && metadata.fingerprint !== currentFingerprint) {
    return { status: "skipped", reason: "Dependency manifest changed." };
  }

  await fsp.symlink(sourcePath, targetPath, process.platform === "win32" ? "junction" : "dir");
  const nextMetadata = {
    ...metadata,
    mode: "project-junction",
    linkedAt: Date.now(),
  };
  await writeJson(metadataPath, nextMetadata);
  return { status: "ready", mode: nextMetadata.mode };
}

async function cleanupPreviewDependencyReuse(workspacePath) {
  const workspaceRoot = path.resolve(String(workspacePath ?? ""));
  const metadataPath = path.join(workspaceRoot, META_DIR, DEPENDENCY_REUSE_FILE);
  const metadata = await readJsonIfExists(metadataPath);
  if (!metadata || metadata.version !== 1 || metadata.mode !== "project-junction") {
    return { status: "skipped" };
  }
  const targetPath = path.join(workspaceRoot, "node_modules");
  try {
    const stat = await fsp.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      await fsp.unlink(targetPath);
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  await writeJson(metadataPath, {
    ...metadata,
    mode: "project-link-pending",
    cleanedAt: Date.now(),
  });
  return { status: "removed" };
}

async function dependencyFingerprint(projectPath) {
  const hash = crypto.createHash("sha256");
  hash.update("codex-draft-dependencies-v1\n");
  for (const fileName of DEPENDENCY_MANIFEST_FILES) {
    const filePath = path.join(projectPath, fileName);
    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
      hash.update(`${fileName}\0${stat.size}\0`);
      hash.update(await fsp.readFile(filePath));
      hash.update("\0");
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }
  return hash.digest("hex");
}

async function copyDirectory(sourceDir, targetDir) {
  let entries = [];
  try {
    entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  await fsp.mkdir(targetDir, { recursive: true });
  for (const entry of entries) {
    if (shouldIgnoreEntry(entry.name, entry.isDirectory())) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(sourcePath, targetPath);
    }
  }
}

async function directoryExists(dirPath) {
  try {
    const stat = await fsp.stat(dirPath);
    return stat.isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await fsp.lstat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function snapshotFiles(rootPath) {
  const files = new Map();
  if (!fs.existsSync(rootPath)) return files;
  await walk(rootPath, async (filePath, relativePath) => {
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    if (shouldIgnoreRelativeFile(normalizedRelativePath)) return;
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return;
    files.set(normalizedRelativePath, {
      hash: await fileHash(filePath),
      size: stat.size,
    });
  });
  return files;
}

async function walk(rootPath, visit, dirPath = rootPath) {
  let entries = [];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (shouldIgnoreEntry(entry.name, entry.isDirectory())) continue;
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, entryPath);
    if (entry.isDirectory()) {
      await walk(rootPath, visit, entryPath);
    } else if (entry.isFile()) {
      await visit(entryPath, relativePath);
    }
  }
}

function shouldIgnoreEntry(name, isDirectory) {
  if (isDirectory) return IGNORED_DIRS.has(name);
  return IGNORED_FILES.has(name);
}

function shouldIgnoreRelativeFile(relativePath) {
  return IGNORED_RELATIVE_FILE_PATTERNS.some((pattern) =>
    pattern.test(normalizeRelativePath(relativePath)),
  );
}

async function fileHashIfExists(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
    return fileHash(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function fileHash(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fsp.readFile(filePath));
  return hash.digest("hex");
}

function changeRecord(kind, relativePath, file) {
  return {
    kind,
    path: normalizeRelativePath(relativePath),
    hash: file.hash ?? "",
    size: Number(file.size ?? 0),
  };
}

function normalizeRelativePath(relativePath) {
  return String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeOptionIds(value) {
  const seen = new Set();
  const ids = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const optionId = normalizeOptionId(item);
      if (seen.has(optionId)) continue;
      seen.add(optionId);
      ids.push(optionId);
    }
  }
  return ids.length > 0 ? ids.slice(0, MAX_OPTIONS_PER_SET) : ["A"];
}

function normalizeOptionId(value) {
  const cleaned = cleanSegment(value, "A").toUpperCase();
  return cleaned === "A" || cleaned === "B" || cleaned === "C"
    ? cleaned
    : "A";
}

function cleanSegment(value, fallback) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function proposalSetRoot(cacheRoot, projectPath, proposalSetId) {
  return path.join(cacheRoot, projectCacheSegment(projectPath), proposalSetId);
}

function projectCacheSegment(projectPath) {
  return `${cleanSegment(path.basename(projectPath), "project")}-${shortHash(
    path.resolve(projectPath).toLowerCase(),
  )}`;
}

function registrySetId(projectPath, proposalSetId) {
  return `${shortHash(path.resolve(projectPath).toLowerCase())}:${proposalSetId}`;
}

function previewOwnerId(projectPath, proposalSetId, optionId) {
  return `code-proposal:${registrySetId(projectPath, proposalSetId)}:${optionId}`;
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function registryPath(cacheRoot) {
  return path.join(path.resolve(cacheRoot), REGISTRY_FILE);
}

async function readProposalRegistry(cacheRoot) {
  const value = await readJsonIfExists(registryPath(cacheRoot));
  if (!value || value.version !== 1 || !value.sets || typeof value.sets !== "object") {
    return { version: 1, updatedAt: Date.now(), sets: {} };
  }
  return {
    version: 1,
    updatedAt: Number(value.updatedAt) || Date.now(),
    sets: value.sets,
  };
}

async function writeProposalRegistry(cacheRoot, registry) {
  await writeJson(registryPath(cacheRoot), {
    version: 1,
    updatedAt: Date.now(),
    sets: registry.sets,
  });
}

async function upsertRegistrySet(cacheRoot, setRecord) {
  return withProposalRegistryWriteQueue(cacheRoot, async () => {
    const registry = await readProposalRegistry(cacheRoot);
    const normalized = normalizeRegistrySet(setRecord);
    registry.sets[normalized.registryId] = normalized;
    await writeProposalRegistry(cacheRoot, registry);
    return normalized;
  });
}

function normalizeRegistrySet(setRecord) {
  const projectPath = path.resolve(String(setRecord.projectPath ?? ""));
  const proposalSetId = cleanSegment(setRecord.proposalSetId, "proposal");
  const registryId = String(setRecord.registryId || registrySetId(projectPath, proposalSetId));
  const rootPath = path.resolve(String(setRecord.rootPath ?? ""));
  const options = Array.isArray(setRecord.options)
    ? setRecord.options
        .map((option) => {
          const id = normalizeOptionId(option?.id);
          const workspacePath = path.resolve(String(option?.workspacePath ?? ""));
          return {
            id,
            workspacePath,
            previewOwnerId: String(
              option?.previewOwnerId || previewOwnerId(projectPath, proposalSetId, id),
            ),
          };
        })
        .filter((option) => pathInsideOrEqual(option.workspacePath, rootPath))
        .slice(0, MAX_OPTIONS_PER_SET)
    : [];
  const optionIds = normalizeOptionIds(
    Array.isArray(setRecord.optionIds) ? setRecord.optionIds : options.map((option) => option.id),
  );
  return {
    version: 1,
    registryId,
    projectPath,
    proposalSetId,
    optionIds,
    rootPath,
    options,
    createdAt: Number(setRecord.createdAt) || Date.now(),
    updatedAt: Number(setRecord.updatedAt) || Date.now(),
  };
}

async function assertRegisteredWorkspace(workspacePath, options = {}) {
  const workspaceRoot = path.resolve(String(workspacePath ?? ""));
  const baseline = options.baseline ?? (await readWorkspaceBaseline(workspaceRoot));
  const rootPath = path.dirname(workspaceRoot);
  const cacheRoot = path.dirname(path.dirname(rootPath));
  const registry = await readProposalRegistry(cacheRoot);
  const registryId = registrySetId(baseline.projectPath, baseline.proposalSetId);
  const set = normalizeRegistrySet(registry.sets[registryId] ?? {});
  if (set.registryId !== registryId || !set.rootPath) {
    throw new Error("Proposal workspace is not registered.");
  }
  if (!samePath(rootPath, set.rootPath) || !pathInsideOrEqual(workspaceRoot, set.rootPath)) {
    throw new Error("Proposal workspace is outside its registered bounds.");
  }
  if (options.projectPath && !samePath(options.projectPath, set.projectPath)) {
    throw new Error("Proposal workspace belongs to another project.");
  }
  const option = set.options.find(
    (candidate) => candidate.id === baseline.optionId && samePath(candidate.workspacePath, workspaceRoot),
  );
  if (!option) {
    throw new Error("Proposal workspace option is not registered.");
  }
  return { cacheRoot, set, option };
}

async function cleanupProposalRegistry(cacheRoot, options = {}) {
  return withProposalRegistryWriteQueue(cacheRoot, async () => {
    const registry = await readProposalRegistry(cacheRoot);
    const now = Date.now();
    const setsByProject = new Map();
    for (const [registryId, rawSet] of Object.entries(registry.sets)) {
      const set = normalizeRegistrySet(rawSet);
      if (!fs.existsSync(set.rootPath)) {
        delete registry.sets[registryId];
        continue;
      }
      if (now - set.updatedAt > MAX_SET_AGE_MS) {
        await fsp.rm(set.rootPath, { recursive: true, force: true });
        delete registry.sets[registryId];
        continue;
      }
      const projectKey = path.resolve(set.projectPath).toLowerCase();
      const projectSets = setsByProject.get(projectKey) ?? [];
      projectSets.push(set);
      setsByProject.set(projectKey, projectSets);
      registry.sets[registryId] = set;
    }

    const keepSetIds = new Set(Array.isArray(options.keepSetIds) ? options.keepSetIds.map(String) : []);
    for (const projectSets of setsByProject.values()) {
      projectSets.sort((left, right) => right.updatedAt - left.updatedAt);
      for (const staleSet of projectSets.slice(MAX_SETS_PER_PROJECT)) {
        if (keepSetIds.has(staleSet.proposalSetId) || keepSetIds.has(staleSet.registryId)) continue;
        await fsp.rm(staleSet.rootPath, { recursive: true, force: true });
        delete registry.sets[staleSet.registryId];
      }
    }

    await writeProposalRegistry(cacheRoot, registry);
    return registry;
  });
}

function withProposalRegistryWriteQueue(cacheRoot, task) {
  const key = path.resolve(String(cacheRoot ?? ""));
  const previous = proposalRegistryWriteQueues.get(key) || Promise.resolve();
  const run = previous.catch(() => null).then(task);
  const tail = run.catch(() => null);
  proposalRegistryWriteQueues.set(key, tail);
  return run.finally(() => {
    if (proposalRegistryWriteQueues.get(key) === tail) {
      proposalRegistryWriteQueues.delete(key);
    }
  });
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
  addProposalWorkspaceOption,
  applyProposalWorkspace,
  cleanupPreviewDependencyReuse,
  cleanupProposalRegistry,
  diffProposalWorkspace,
  ensurePreviewDependencyReuse,
  prepareProposalWorkspaces,
  _test: {
    cleanupPreviewDependencyReuse,
    ensurePreviewDependencyReuse,
    readProposalRegistry,
    registrySetId,
    snapshotFiles,
  },
};
