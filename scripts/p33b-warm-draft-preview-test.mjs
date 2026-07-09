import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const draftPreviewSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/components/DraftPreview.tsx"),
  "utf8",
);
const stylesSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/styles.css"),
  "utf8",
);
const liveAppPreviewSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/components/LiveAppPreview.tsx"),
  "utf8",
);
const electronMainSource = readFileSync(
  path.join(repoRoot, "apps/desktop/electron/main.cjs"),
  "utf8",
);

const liveAppPreviewRenders =
  draftPreviewSource.match(/<LiveAppPreview\b/g)?.length ?? 0;

assert.equal(
  liveAppPreviewRenders,
  2,
  "DraftPreview should render separate warm Live and Draft preview instances",
);
assert.match(
  draftPreviewSource,
  /const \[mountedTabs, setMountedTabs\] = useState\(/,
  "DraftPreview should remember which lanes have mounted",
);
assert.match(
  draftPreviewSource,
  /onSelect: \(\) => selectTab\("live"\)/,
  "Live tab should switch visibility without remounting Draft",
);
assert.match(
  draftPreviewSource,
  /onSelect: \(\) => selectTab\("draft"\)/,
  "Draft tab should switch visibility without remounting Live",
);
assert.match(
  draftPreviewSource,
  /key=\{`live:\$\{project\.id\}`\}/,
  "Live preview key should be stable for the Live project",
);
assert.match(
  draftPreviewSource,
  /key=\{`draft:\$\{draft\.draftId\}:\$\{props\.refreshNonce \?\? 0\}`\}/,
  "Draft preview key should stay stable across status ticks and change only on explicit refresh",
);
assert.match(
  draftPreviewSource,
  /preferredDraftRoute/,
  "DraftPreview should derive a preferred route from Draft affected routes",
);
assert.match(
  draftPreviewSource,
  /preferredRoute=\{preferredDraftRoute\}/,
  "Draft preview should open the affected Draft route when managed preview starts",
);
assert.match(
  draftPreviewSource,
  /sessionPartitionKey=\{project\.id\}/,
  "Live and Draft lanes should share the Live project's preview session partition",
);
assert.match(
  draftPreviewSource,
  /appStateTabOptions=\{tabOptions\}/,
  "DraftPreview should render Live and Draft as app-state tabs",
);
assert.doesNotMatch(
  draftPreviewSource,
  /compareTabOptions=\{tabOptions\}/,
  "DraftPreview should not render Draft through the proposal lane tabs",
);
assert.match(
  liveAppPreviewSource,
  /appStateTabOptions\?: PreviewToolbarSelectOption\[\];/,
  "LiveAppPreview should support app-state lane tabs for Live and Draft",
);
assert.doesNotMatch(
  draftPreviewSource,
  /const previewKey = liveSelected\s*\?/,
  "DraftPreview should not derive a single preview key from the selected tab",
);
assert.doesNotMatch(
  draftPreviewSource,
  /key=\{previewKey\}/,
  "DraftPreview should not force a LiveAppPreview remount on tab switches",
);
assert.match(
  stylesSource,
  /\.draft-preview-warm-stack\s*\{/,
  "Warm preview stack styles should exist",
);
assert.match(
  stylesSource,
  /\.draft-preview-warm-pane\.inactive\s*\{[^}]*visibility: hidden;/,
  "Inactive warm preview panes should be hidden without unmounting",
);
assert.doesNotMatch(
  stylesSource,
  /\.draft-preview-warm-pane\.inactive\s*\{[^}]*display:\s*none;/,
  "Inactive warm preview panes should not use display:none",
);
assert.match(
  liveAppPreviewSource,
  /preferredRoute\?: string;/,
  "LiveAppPreview should accept an optional preferred route",
);
assert.match(
  liveAppPreviewSource,
  /sessionPartitionKey\?: string;/,
  "LiveAppPreview should accept a session partition override",
);
assert.match(
  liveAppPreviewSource,
  /partition=\{`persist:codex-app-preview-\$\{sessionPartitionKey\}`\}/,
  "LiveAppPreview should use the session partition override for webview storage",
);
assert.match(
  liveAppPreviewSource,
  /const PREVIEW_CREDENTIAL_EVENT = "codex-preview-credentials-updated"/,
  "Live and Draft previews should announce shared credential updates",
);
assert.match(
  liveAppPreviewSource,
  /function capturePreviewCredentialStorageScript/,
  "LiveAppPreview should capture auth-shaped storage keys from loaded preview apps",
);
assert.match(
  liveAppPreviewSource,
  /function applyPreviewCredentialStorageScript/,
  "LiveAppPreview should import shared auth-shaped storage keys into sibling preview apps",
);
assert.match(
  liveAppPreviewSource,
  /if \(applied && hasCredentials\)/,
  "Preview credential import should redirect from auth only when credentials are present",
);
assert.match(
  liveAppPreviewSource,
  /function previewCredentialSnapshotsEqual/,
  "Preview credential updates should not rebroadcast unchanged snapshots",
);
assert.ok(
  liveAppPreviewSource.includes("sb-|supabase\\\\.|supabase-|gotrue\\\\.|auth\\\\.|auth-|agentcat-auth"),
  "Credential sharing should be limited to auth-shaped storage keys",
);
assert.match(
  liveAppPreviewSource,
  /function applyPreferredPreviewRoute/,
  "Managed preview recovery should be able to apply a preferred route",
);
assert.doesNotMatch(
  liveAppPreviewSource,
  /props\.previewControls\?\.autoStart\s*\?\s*""/,
  "Auto-starting Draft previews should try a remembered Draft URL before allocating a fresh port",
);
assert.match(
  liveAppPreviewSource,
  /if \(!opened && props\.previewControls\?\.autoStart\)/,
  "Auto-starting Draft previews should fall back to managed start only after the remembered URL fails",
);
assert.match(
  liveAppPreviewSource,
  /applyPreferredPreviewRoute\(\s*status\.finalUrl \|\| status\.url,\s*props\.preferredRoute,\s*\)/,
  "Managed preview status recovery should preserve the Draft route",
);
assert.match(
  liveAppPreviewSource,
  /const focusPreviewWebview = useCallback/,
  "LiveAppPreview should explicitly focus Electron webviews before keyboard input",
);
assert.match(
  liveAppPreviewSource,
  /onPointerDown=\{focusPreviewWebview\}/,
  "Electron app preview clicks should focus the webview before typing",
);
assert.match(
  liveAppPreviewSource,
  /onPointerDownCapture=\{canShowWebview && !marking \? focusPreviewWebview : undefined\}/,
  "Preview stage clicks should focus the Electron webview before guest input",
);
assert.match(
  liveAppPreviewSource,
  /tabIndex=\{0\}/,
  "Electron app preview webviews should be keyboard-focusable",
);
assert.match(
  liveAppPreviewSource,
  /sendInputEvent\?: \(event: PreviewWebviewInputEvent\)/,
  "LiveAppPreview should type Electron webview input through sendInputEvent when focus relay is needed",
);
assert.match(
  liveAppPreviewSource,
  /window\.addEventListener\("keydown", handleKeyDown, true\)/,
  "LiveAppPreview should capture host keydown events while the preview webview is focused",
);
assert.match(
  liveAppPreviewSource,
  /document\.activeElement === webview/,
  "Preview keyboard relay should only run for the focused preview webview",
);
assert.match(
  liveAppPreviewSource,
  /function previewKeyboardInputEvents\(event: KeyboardEvent\)/,
  "Preview keyboard relay should translate text and editing keys into Electron input events",
);
assert.match(
  liveAppPreviewSource,
  /const previewShortcutKeys = new Set\(\["a", "c", "x", "y", "z"\]\)/,
  "Preview keyboard relay should forward common focused-webview editing shortcuts",
);
assert.match(
  liveAppPreviewSource,
  /if \(event\.ctrlKey\) modifiers\.push\("control"\)/,
  "Preview keyboard relay should preserve the Control modifier for shortcuts like Ctrl+A",
);
assert.match(
  liveAppPreviewSource,
  /window\.addEventListener\("paste", handlePaste, true\)/,
  "LiveAppPreview should capture paste events while the preview webview is focused",
);
assert.match(
  liveAppPreviewSource,
  /function sendPreviewTextInput\(/,
  "Preview paste relay should replay clipboard text as native webview input",
);
assert.match(
  liveAppPreviewSource,
  /function buildPreviewTextInsertionScript\(text: string\)/,
  "Preview paste relay should insert clipboard text into the active guest input",
);
assert.match(
  electronMainSource,
  /if \(record\.exited\) \{[\s\S]*probeAppPreviewUrl\(record\.url\)/,
  "Managed preview status should probe exited wrapper records before starting a new port",
);
assert.doesNotMatch(
  electronMainSource,
  /record\.child\.once\("exit"[\s\S]*managedPreviewProcesses\.delete\(key\);[\s\S]*\}\);/,
  "Managed preview wrapper exit should not immediately forget the running preview URL",
);

console.log("p33b warm draft preview switching passed");
