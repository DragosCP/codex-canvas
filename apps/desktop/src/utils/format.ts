export function decodeBase64(value: string) {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function formatRelative(seconds: number) {
  const delta = Math.max(0, Date.now() / 1000 - seconds);
  if (delta < 60) return "now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h`;
  return `${Math.floor(delta / 86400)}d`;
}

export function lineCount(text: string) {
  return text.split("\n").filter(Boolean).length;
}
