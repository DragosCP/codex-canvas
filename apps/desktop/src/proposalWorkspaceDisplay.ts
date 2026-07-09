export function proposalWorkspaceDisplayPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const proposalMatch = normalized.match(
    /(?:^|\/)proposal-workspaces\/[^/]+\/[^/]+\/([ABC])(?:\/(.+))?$/i,
  );
  if (proposalMatch) {
    const optionId = proposalMatch[1].toUpperCase();
    return workspaceInnerDisplayPath(
      `Option ${optionId}`,
      proposalMatch[2] ?? "",
    );
  }
  const draftMatch = normalized.match(
    /(?:^|\/)draft-workspaces\/workspaces\/[^/]+\/[^/]+\/A(?:\/(.+))?$/i,
  );
  if (draftMatch) return workspaceInnerDisplayPath("Draft", draftMatch[1] ?? "");
  return null;
}

function workspaceInnerDisplayPath(label: string, path: string) {
  const innerPath = path.replace(/^\/+/, "");
  if (!innerPath || innerPath.toLowerCase() === "index.html") {
    return label;
  }
  return `${label} / ${innerPath}`;
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
