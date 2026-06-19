const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const fsp = fs.promises;

const META_DIR = ".codex-proposal";
const BASELINE_FILE = "baseline.json";
const SET_FILE = "proposal-set.json";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
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
  const rootPath = path.join(
    cacheRoot,
    cleanSegment(path.basename(projectPath), "project"),
    proposalSetId,
  );

  await fsp.rm(rootPath, { recursive: true, force: true });
  await fsp.mkdir(rootPath, { recursive: true });

  const options = [];
  for (const optionId of optionIds) {
    const workspacePath = path.join(rootPath, optionId);
    await copyProject(projectPath, workspacePath);
    await writeWorkspaceBaseline(workspacePath, {
      projectPath,
      proposalSetId,
      optionId,
    });
    options.push({ id: optionId, workspacePath });
  }

  await writeJson(path.join(rootPath, SET_FILE), {
    version: 1,
    projectPath,
    proposalSetId,
    optionIds,
    createdAt: Date.now(),
  });

  return { proposalSetId, rootPath, options };
}

async function addProposalWorkspaceOption(args) {
  const projectPath = path.resolve(String(args.projectPath ?? ""));
  const cacheRoot = path.resolve(String(args.cacheRoot ?? ""));
  const proposalSetId = cleanSegment(args.proposalSetId, "proposal");
  const optionId = normalizeOptionId(args.optionId);
  const rootPath = path.join(
    cacheRoot,
    cleanSegment(path.basename(projectPath), "project"),
    proposalSetId,
  );
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
  await writeJson(setPath, {
    version: 1,
    projectPath,
    proposalSetId,
    optionIds,
    createdAt: Number(existingSet?.createdAt) || Date.now(),
    updatedAt: Date.now(),
  });

  return {
    proposalSetId,
    rootPath,
    options: [{ id: optionId, workspacePath }],
  };
}

async function diffProposalWorkspace(workspacePath) {
  const workspaceRoot = path.resolve(String(workspacePath ?? ""));
  const baseline = await readWorkspaceBaseline(workspaceRoot);
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
    optionId: baseline.optionId,
    workspacePath: workspaceRoot,
    changedFiles: changes.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

async function applyProposalWorkspace(args) {
  const projectRoot = path.resolve(String(args.projectPath ?? ""));
  const workspaceRoot = path.resolve(String(args.workspacePath ?? ""));
  const baseline = await readWorkspaceBaseline(workspaceRoot);
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

async function snapshotFiles(rootPath) {
  const files = new Map();
  if (!fs.existsSync(rootPath)) return files;
  await walk(rootPath, async (filePath, relativePath) => {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return;
    files.set(normalizeRelativePath(relativePath), {
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
  return ids.length > 0 ? ids.slice(0, 3) : ["A"];
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

module.exports = {
  addProposalWorkspaceOption,
  applyProposalWorkspace,
  diffProposalWorkspace,
  prepareProposalWorkspaces,
  _test: {
    snapshotFiles,
  },
};
