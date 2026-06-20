export function proposalWorkspaceDisplayPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(
    /(?:^|\/)proposal-workspaces\/[^/]+\/[^/]+\/([ABC])(?:\/(.+))?$/i,
  );
  if (!match) return null;
  const optionId = match[1].toUpperCase();
  const optionLabel = `Option ${optionId}`;
  const innerPath = (match[2] ?? "").replace(/^\/+/, "");
  if (!innerPath || innerPath.toLowerCase() === "index.html") {
    return optionLabel;
  }
  return `${optionLabel} / ${innerPath}`;
}

export function projectRelativeDisplayPath(path: string, projectPath: string) {
  const normalizedProjectPath = projectPath
    .replace(/\\/g, "/")
    .replace(/\/$/, "");
  const normalizedPath = path.replace(/\\/g, "/");
  if (normalizedPath === normalizedProjectPath) return ".";
  if (normalizedPath.startsWith(`${normalizedProjectPath}/`)) {
    return normalizedPath.slice(normalizedProjectPath.length + 1);
  }
  return null;
}
