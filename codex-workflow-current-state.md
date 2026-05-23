# Codex Workflow Current State

## Scope

This report describes the current prompt-to-response workflow for Codex as observed from the local codebase and its tests. It is written for a reader who does not have source access, so it avoids source-level names, file names, method names, class names, and reference code.

The scope covers how user prompts enter the system, how an agent run is created, how model responses and tool calls are handled, how cancellation and recovery behave, what the user sees in the interface, what state is persisted, and how file-edit and git-related workflows are represented.

The output artifact is `codex-workflow-current-state.md`.

## Method

The investigation inspected the repository entry documentation, contribution guidance, installation notes, workspace configuration, runtime entrypoints, desktop app server documentation, protocol definitions, core session execution paths, tool runtime behavior, persistence logic, terminal UI event handling, app-server event translation, and tests.

The report intentionally translates implementation details into architecture-level descriptions. Subsystem names such as CLI, desktop app server, agent session, tool runtime, terminal UI, app connectors, and persistent transcript are used instead of source identifiers.

## High-Level Mental Model

Codex is organized around threads and turns. A thread is a conversation container with configuration, transcript history, working directory context, model settings, and optional durable metadata. A turn is one unit of user intent: a prompt, an optional set of attachments or contextual inputs, and the agent work needed to answer it.

At a high level, user input can enter through three surfaces:

- The interactive terminal UI.
- A noninteractive CLI flow.
- The desktop app server used by app clients and app-like integrations.

All three converge on the same core agent session. The agent session serializes user work into turns, builds the model request from current context and persisted history, streams model events, executes requested tools, feeds tool results back to the model, and emits user-visible events as the turn progresses.

The desktop app server is an event bridge. It accepts client requests, starts or resumes threads, forwards input into the agent session, receives core events, tracks active turn state, and emits normalized notifications to clients. The terminal UI consumes those notifications to render conversation history, status indicators, approval prompts, command output, file-change summaries, errors, and final answers.

Tool execution is not a side channel. Tool calls are part of the model loop. The model requests a tool, the runtime validates and executes it under the current sandbox and approval policy, then the result is returned to the model as structured input for the next step. A single user turn can therefore contain multiple model calls and tool rounds before the final assistant answer is produced.

Persistence is split between durable thread history and live turn state. Durable state includes the conversation transcript, selected session metadata, turn boundaries, some completed tool outcomes, compaction markers, rollback markers, selected error records, token usage, and file-change summaries. Live-only state includes pending approvals, active cancellation handles, streaming text deltas, active terminal processes, pending user steering input, in-memory retry state, active UI cells, and temporary request correlations.

## User Request Lifecycle

A user prompt starts as surface-specific input. In the terminal UI, the composer turns text, attachments, mentions, and selected context into one or more user input items. In noninteractive mode, the prompt is assembled from command arguments and optional standard input. In desktop app usage, the client sends a start-turn request with input items and optional configuration overrides.

Before a prompt becomes agent work, the runtime resolves the effective turn context. This includes the current working directory, model and reasoning settings, approval policy, sandbox policy, permission profile, user and developer instructions, active personality or collaboration settings, and any client-provided runtime metadata. This context is recorded with the turn so later resume or replay can reconstruct what the agent was asked to do under which conditions.

The prompt then enters the agent session as a queued operation. If no turn is active, the session starts a new turn. If a compatible turn is already active and the user sends additional instructions, the input may be treated as mid-run steering rather than a separate turn. Steering is accepted only when the active turn can receive it and the client is aligned with the current active turn. If the active turn cannot be steered, the input is rejected or queued by the UI depending on the surface.

Once accepted, the user input becomes both model context and user-visible history. The terminal UI may render the user message immediately for normal starts. For mid-run steering, the UI may keep the new instruction pending until the active work either accepts it or is interrupted. This prevents the visible transcript from claiming the agent has processed input that is still waiting.

Internally, conversation state is represented as a mix of durable transcript items and transient event notifications. Durable items include user messages, assistant messages, selected reasoning summaries, completed tool outcomes, compaction markers, thread rollback markers, and turn boundary markers. Transient events include streaming assistant deltas, active tool progress, terminal output chunks, approval requests, in-progress status changes, and many UI-only coordination events.

Live-only state is held while a turn is running. It includes active tasks, pending approvals, pending permission requests, pending user input requests, active tool call tracking, cancellation tokens, current retry state, active terminal handles, and pending steering input. This live state is cleared, completed, or converted into durable markers when the turn finishes, fails, or is interrupted.

## Agent Execution Loop

The agent execution loop begins when a turn starts. The session emits a turn-started notification, prepares current context, records the user input in the transcript, and assembles the model request from persisted conversation history plus the new prompt and active turn settings.

Before sending the model request, the runtime may load additional context from enabled tools, app connectors, skills, environment metadata, or conversation compaction state. If the accumulated context is too large or the system decides compaction is needed, a compaction pass can summarize prior context and record a compaction marker before continuing.

The model call streams events back to the runtime. These events can include assistant text, reasoning summaries, tool call requests, tool-call argument deltas, web or image generation progress, and completion signals. Streaming assistant text is surfaced incrementally to the UI. Reasoning or progress-like content may be shown as status, summaries, or collapsed details depending on the interface.

When the model requests a tool, the agent loop does not finish the turn. Instead, tool work is scheduled, executed, and converted into structured results. The runtime then sends those results back into the next model request. This can repeat for multiple steps: model call, tool call, tool result, model continuation, additional tool calls, and finally assistant answer.

Multiple tool calls can be represented as separate in-progress items within a single turn. The runtime distinguishes tool calls that can run concurrently from calls that must be serialized. It tracks each tool call independently so cancellation, errors, and user-visible progress can be attributed to the correct activity.

Progress is surfaced through several channels:

- A turn-started state tells clients that the agent is working.
- Assistant text deltas stream into the transcript.
- Reasoning or planning updates can appear as progress/status content.
- Tool-call begin and completion events create visible command, connector, web, image, or file-change entries.
- Terminal output deltas stream into active command cells.
- Turn-diff updates summarize accumulated file changes.
- A final turn-completed state tells clients whether the turn completed, failed, or was interrupted.

The final answer is produced when the model returns assistant content without further required tool calls and the turn reaches completion. The final assistant message is stored in conversation history and included in the turn completion summary. If no final message exists because the run failed or was interrupted, the completion status and error or interruption state carry the outcome instead.

## Tool Call Lifecycle

Tool handling is centralized around a runtime that knows which tools are available for the current turn, which tools require approval, which can access the filesystem or network, which can run in the sandbox, and how results are returned to the model.

When a model requests a tool, the runtime first identifies the target capability. Tools may include shell or terminal commands, file patch application, app connector calls, browser-like or web capabilities when enabled, image generation when enabled, permission requests, user input requests, dynamic tools advertised by the client, and other external integrations.

The runtime validates the request. Invalid arguments, unsupported tools, disabled tools, or tools unavailable in the current mode are converted into model-visible tool errors. These failures are generally nonfatal for the turn unless the error is considered unrecoverable by the runtime.

For shell and terminal commands, the runtime resolves the command, working directory, environment, sandbox policy, approval requirement, and whether elevated permissions were requested. Commands are normally executed through the active sandbox policy. If a sandboxed command fails specifically because the sandbox blocks required access, the runtime may ask for approval to rerun it with broader permissions when policy allows. If policy does not allow approval, the failure is returned to the model.

Command output is streamed while the command runs. The user can see command start, output, duration, exit status, and completion state. A command that exits with a nonzero status is represented as a failed command result, but the failure can still be fed back to the model so the agent can respond or recover.

For file edits, the primary observed workflow is patch-based. The model proposes a patch-shaped edit. The runtime validates the edit, determines affected paths, applies file-change approval rules, and then applies the patch if allowed. Successful patch application updates a turn-level diff tracker so the UI and clients can see accumulated file changes for the current turn. Failed or declined patch applications are reported both to the model and to the user-visible surface.

For app connector calls, the runtime checks whether the connector and tool are available, validates arguments, handles app-specific authorization or elicitation flows, executes the call, sanitizes output where needed, and returns the result to the model. Connector calls are displayed as tool activity in the UI, often with expandable details.

For browser, web, image, or external generation tools, the runtime treats progress as tool-like activity. Begin, progress, and completion events can be surfaced to clients. The final result is returned to the model in a structured form and may also be displayed as a completed tool or generated artifact.

Approval handling is part of the tool lifecycle. A tool request can produce an approval prompt before execution. Approval prompts may allow a single run, a session-wide approval, a permission amendment, or cancellation. Decline means the tool does not run and the model receives a rejection result. Cancel means the current turn is interrupted or redirected according to the surface behavior.

Tool results are fed back to the model as structured outputs tied to the original tool request. This link lets the model continue reasoning with command output, connector results, patch success or failure, or permission outcomes. The user sees the same activity through command cells, connector cells, approval overlays, status lines, and diff summaries.

## Cancellation And Interruption

User cancellation targets the active turn. When the user stops a run, the session signals cancellation to the active task and gives in-progress work a short opportunity to finish cleanly. Pending approvals, user input requests, and other waiting interactions are resolved or cleared so the turn cannot hang indefinitely.

An interrupted turn is represented explicitly. The runtime records an interruption marker so future model context can know that previous work was stopped rather than naturally completed. The app-facing layer emits a turn-completed notification with an interrupted status, and the terminal UI finalizes active history cells.

Partial work remains visible when it already reached the transcript or UI. For example, streamed assistant text, command output, completed tool cells, and applied file patches can remain visible after interruption. Work that was only in live buffers, such as pending steering drafts or unresolved approval prompts, may be restored to the composer, dropped, or marked inactive depending on the surface and timing.

If the user sends a new instruction mid-run, the system first tries to treat it as steering input for the active turn. Steering is accepted only for compatible active turns. If accepted, the instruction is delivered into the running agent loop and may be processed after the current model or tool step. If the user interrupts specifically to redirect the agent, the terminal UI can preserve the pending instruction and submit it after interruption.

Cancellation does not necessarily terminate every background terminal process. Background terminal cleanup is handled separately. This means the visible turn can be interrupted while long-lived process cleanup remains a distinct lifecycle concern.

Cancelled work is user-visible as an interrupted turn rather than a normal failure. Active command or tool cells may be finalized as failed, declined, or interrupted depending on what was happening when cancellation arrived. The user may also see an explanatory transcript line indicating that the conversation was interrupted or that the model was interrupted to submit steering instructions.

## Error And Recovery Behavior

Errors are divided into retryable stream/provider failures, non-retryable turn failures, tool failures, command failures, and UI or connection-level failures.

Retryable model or network stream errors can trigger automatic retry. During retry, the UI receives a recoverable error notification and typically shows a reconnecting or thinking status rather than immediately failing the turn. The retry loop can use provider-supplied retry timing or an internal backoff. If one transport path fails and another is available, the runtime can switch transport and continue. If retry budget is exhausted, the turn fails.

Non-retryable model or provider errors are surfaced as turn errors. Examples include invalid requests, context overflow, quota or usage limits, server-side terminal failures, policy rejections, or explicit unrecoverable runtime errors. The app-facing layer records the error against the active turn when appropriate and emits a failed turn completion.

Tool errors are usually returned to the model as tool results rather than immediately aborting the turn. Invalid tool arguments, unavailable tools, rejected approvals, declined file changes, and command failures can all become model-visible outcomes. This lets the model explain the failure, choose another path, or finish with an answer that acknowledges the problem.

Some tool errors are fatal to the turn. Fatal tool failures stop the loop, produce a user-visible error, and mark the turn as failed. The distinction is based on whether the runtime can safely continue and whether the failure can be represented as a normal tool output.

Command failures are shown in the command surface. Nonzero exit status, timeout, sandbox denial, execution errors, or cancellation are represented as failed command results. Standard output and error output are preserved when available. If a command produces no output, the UI can show a no-output state rather than leaving the result blank.

Network failures during model streaming are treated as retryable when classified as transient. Network failures during external tool calls depend on the tool. A connector or web call can return an error result to the model, while a broader transport failure can fail the turn or surface as an app-server error.

Reconnect and resume behavior is supported through persisted thread history and app-server replay. When a client reconnects, the app-facing layer can rebuild the current or recent turn view from tracked thread state and durable transcript entries. Active live-only operations that cannot be reconstructed, such as a pending approval whose turn already completed, are dropped or marked inactive.

The user sees errors through transcript error cells, command failure cells, status indicators, app-level error notifications, or failed turn status. Recoverable stream errors are visible as temporary reconnecting status; unrecoverable errors are visible as final failure states.

## UI / Status Surfaces

The terminal UI displays user messages as transcript entries when they are accepted as visible conversation input. For mid-run steering, the UI can hold the message as pending until it is actually submitted or restored after interruption.

Assistant messages stream into the transcript. Partial assistant text can appear while the model is still generating. At turn completion, the final assistant message is kept as the durable assistant response when one exists.

Progress and status are surfaced through the bottom composer/status area and transcript cells. The UI can show that the agent is working, thinking, reconnecting, running a command, applying changes, waiting for approval, or finishing a turn. Status lines are reset or finalized when the turn completes, fails, or is interrupted.

Tool calls appear as dedicated entries. Shell commands are displayed with command text, streamed output, duration, and result state. App connector calls appear as active or completed tool cells. Web, image, and external generation activities can appear as tool-like progress and completion entries when enabled.

Details may be collapsed or summarized. Long command output is summarized in the main transcript, while fuller output may be available in expanded or transcript-specific views depending on the surface. Connector output can be masked, summarized, or hidden when sensitive or too large.

Approval prompts appear as overlays or server-request surfaces. The user can approve, approve for the session, adjust allowed permissions when offered, decline and continue, or cancel and redirect. Once resolved, approval prompts are dismissed and the result is sent back to the agent session.

File changes appear through patch and diff surfaces. A successful patch creates a visible file-change entry with summary information. Accumulated file changes for the turn can also be published as a turn-level diff update. Failed or declined file edits are shown as failed change entries.

Error messages appear in transcript cells, command cells, status areas, or app notifications. Recoverable stream errors generally appear as retrying or reconnecting status. Failed turns show an error state and clear active work indicators.

Retry, edit, and continue controls were observed mainly as workflow behaviors rather than one universal control. The system supports automatic retry for transient model-stream errors, follow-up input after completion, input restoration after certain interruptions, thread resume, thread fork, and rollback. The exact set of visible controls depends on the client surface.

## Persistence And Resume Behavior

Codex persists conversation history in a line-oriented transcript associated with a thread. The transcript is created when there is something to persist, rather than necessarily at session construction time. Resumed sessions reopen the existing transcript and append new entries.

Durable transcript entries include session metadata, user messages, assistant messages, selected reasoning summaries, completed tool outcomes, turn start and completion markers, interruption markers, compaction markers, rollback markers, selected errors, token usage records, completed file-change records, and selected external tool results.

Not every event is durable. Streaming text deltas, active command progress, output chunks, pending approvals, active terminal handles, pending user-input prompts, dynamic request correlations, and many begin/progress notifications are live-only. The UI can render them while connected, but resume reconstructs from the durable entries and app-server active-turn tracking rather than from every original event.

Thread state also includes metadata such as creation and update times, working directory association, git metadata when available, and session configuration sufficient to resume or list conversations. Ephemeral threads keep conversation state in memory and do not create a persistent transcript.

Resume reconstructs history from persisted transcript entries and starts a new agent session with the recovered context. If the user resumes and sends new input, the agent receives prior durable conversation history plus the new turn context. Persisted model and reasoning settings may be reused unless the client supplies overrides.

Forking creates a new conversation lineage from an existing thread. If a fork happens while work is active, the current active work is treated consistently with interruption behavior so the new line of work has a clear boundary.

Rollback removes later conversation state from the active view and records a rollback marker. Rollback is not allowed while a turn is active. After rollback, the reconstructed history reflects the selected earlier point plus the rollback event.

Context compaction is represented durably. When prior context is summarized to fit the model window, the compacted state is recorded so future turns and resumed sessions can continue from the compacted conversation rather than replaying all prior raw detail.

Persistence writes are buffered and retried where possible. If opening or writing the transcript fails, the runtime can retain buffered items temporarily and warn, then retry on later flush. The user-visible result depends on whether the failure affects the active turn or only transcript durability.

## File Edit And Git Workflow

File edits are primarily patch-oriented. The agent proposes a structured patch, the runtime validates it, checks permissions and approvals, applies it, and records the outcome. This gives the system a clear boundary between proposed changes, approved changes, successfully applied changes, failed changes, and declined changes.

The runtime tracks file changes within a turn. When patches apply cleanly, the system can derive an accumulated diff for the current turn without rereading every file from disk. If the system cannot confidently track the exact net change, the turn-level diff can be invalidated rather than presenting an unreliable summary.

The user sees file edits as patch or file-change entries in the UI. Successful edits show summary information and contribute to the turn diff. Failed edits show failure state. Declined edits show that the change was not applied. Approval prompts can be path-aware and may allow session-level approval when policy permits.

Sandbox and permission policy affect file edits. In restricted modes, writes may be limited to allowed directories, and sensitive internal state directories can remain read-only. When a requested edit exceeds the allowed policy, the system can ask for approval, decline the operation, or return an error to the model depending on the active approval mode.

Dirty working trees are handled conservatively by workflow rather than through a fully separate source-control transaction system. The agent can inspect existing changes and is expected to avoid reverting unrelated user work. The file-edit runtime applies requested patches to the current filesystem state and reports conflicts or application failures if the expected content does not match.

Git itself is available mainly through normal shell command execution and thread metadata. The system can record git-related metadata for a thread and can run git commands when the user or model invokes them through the terminal tool under the active approval and sandbox policy. Branch creation, commits, and merge actions are not a separate always-on workflow in the core turn loop; they are performed through tool calls or higher-level client workflows when supported.

## Workflow Matrix

| Action | Condition | Current Behavior | User-Visible Surface | Durable State | Live-Only State | Code Owners |
|---|---|---|---|---|---|---|
| Submit prompt | No active compatible turn | Creates a new turn, records context, sends user input into the agent session, and starts model execution. | User message appears in transcript; status changes to working. | User message, turn context, turn-start marker, later completion marker. | Active task, cancellation handle, current status, streaming buffers. | Terminal UI, Desktop app server, Agent runtime, Persistence layer |
| Submit prompt | Active steerable turn | Treats input as steering for the running turn when turn identity and mode match. | May show as pending or delayed until accepted. | Recorded when materialized into the conversation. | Pending steering input and active turn correlation. | Terminal UI, Desktop app server, Agent runtime |
| Submit prompt | Active non-steerable turn | Rejects or queues the input depending on surface behavior. | User may see restored draft, queue behavior, or structured rejection. | None unless later submitted. | Draft, queued message, active turn snapshot. | Terminal UI, Desktop app server |
| Start model step | Turn has assembled context | Sends conversation context and available tool definitions to the model provider. | Thinking or working status. | No separate durable record unless later events are persisted. | Stream state, retry budget, request timing, active model session. | Agent runtime, Model client |
| Stream assistant response | Model emits text | Appends deltas to active assistant output and displays them incrementally. | Streaming assistant message. | Final assistant message when completed. | Partial text buffer and stream position. | Agent runtime, Desktop app server, Terminal UI |
| Request tool | Model emits a tool call | Validates tool availability, arguments, permissions, and execution mode. | Tool cell or status entry starts. | Completed tool outcome if persisted by policy. | Active tool call, argument deltas, request correlation. | Agent runtime, Tool runtime |
| Run shell command | Tool is allowed or approved | Executes command under current sandbox and streams output. | Command cell with output, duration, and result. | Completed command result may be persisted under extended history policy. | Process handle, output stream, active command cell. | Tool runtime, Sandbox layer, Terminal UI |
| Shell command blocked | Policy or sandbox denies execution | Declines, asks for approval, or returns a failure result depending on policy. | Approval prompt, declined command, or failure cell. | Approval outcome or completed failure when persisted. | Pending approval and sandbox retry state. | Tool runtime, Sandbox layer, Terminal UI |
| Apply patch | Patch validates and permission allows | Applies file changes, records result, and updates turn diff. | File-change entry and diff summary. | Completed file-change record and turn diff event when persisted. | Patch approval, diff tracker, active file-change cell. | Tool runtime, File edit runtime, Terminal UI |
| Patch fails | Patch does not apply or is declined | Reports failure or decline to the model and UI. | Failed or declined file-change entry. | Failed or declined result when persisted by policy. | Validation details and active patch state. | File edit runtime, Terminal UI |
| App connector call | Connector tool is available | Executes external capability, handles authorization prompts when needed, and returns sanitized result to model. | Connector tool cell with active/completed state. | Completed connector result when persisted by policy. | Pending connector request, elicitation state, result buffer. | Tool runtime, App connector runtime, Desktop app server |
| Approval accepted | User approves a pending request | Continues the blocked tool or permission action. | Approval overlay closes; tool proceeds. | Approval outcome may be reflected through resulting tool entry. | Pending approval cleared; possible session approval cache. | Terminal UI, Desktop app server, Tool runtime |
| Approval declined | User declines but continues turn | Tool does not run; model receives a rejection result. | Declined tool or approval dismissal. | Rejection result when persisted by policy. | Pending approval cleared. | Terminal UI, Tool runtime |
| Approval cancelled | User cancels to redirect or stop | Interrupts or redirects active turn depending on surface. | Turn interruption message or restored draft. | Interruption marker if turn is aborted. | Pending approval cleared; cancellation state. | Terminal UI, Agent runtime |
| Interrupt turn | User stops active work | Cancels active task, clears pending interactions, finalizes turn as interrupted. | Interrupted status, finalized active cells, optional explanatory line. | Interruption marker and turn completion status. | Cancellation token, active task, pending prompts, active cells. | Agent runtime, Desktop app server, Terminal UI |
| Model stream error | Error is classified retryable | Emits recoverable error, waits, and retries or switches transport when available. | Reconnecting or thinking status. | Usually none unless final failure occurs. | Retry counter, backoff timer, active stream state. | Model client, Agent runtime, Terminal UI |
| Model error | Error is non-retryable or retries exhausted | Fails the active turn and records error state. | Error cell or failed turn status. | Error record and failed turn completion when applicable. | Active task cleanup and last-error state. | Model client, Agent runtime, Desktop app server |
| Tool error | Error can be represented as tool output | Returns structured failure to model and allows turn to continue. | Failed tool cell or command result. | Completed tool failure when persisted by policy. | Tool runtime error context. | Tool runtime, Agent runtime |
| Fatal tool error | Runtime cannot safely continue | Stops turn and surfaces failure. | Failed turn and error message. | Error record and failed completion when applicable. | Active task cleanup. | Tool runtime, Agent runtime |
| No command output | Command completes without output | Records completion and displays explicit no-output state where applicable. | Command cell shows no output rather than blank content. | Completed command result when persisted by policy. | Active command output buffer. | Tool runtime, Terminal UI |
| Resume thread | Durable transcript exists | Reconstructs conversation history and starts a new session from persisted state. | Existing transcript reappears; user can continue. | Existing transcript and metadata reused. | New active session state and client subscriptions. | Persistence layer, Desktop app server, Terminal UI |
| Reconnect client | Client loses and regains connection | Replays thread state and active turn snapshot where available. | Transcript and in-progress state are restored as far as persisted/tracked. | Transcript and thread metadata. | Subscription handles and active request correlations. | Desktop app server, Terminal UI |
| Roll back thread | No turn is active | Reconstructs history to an earlier point and records rollback. | Transcript reflects selected earlier state. | Rollback marker and reconstructed durable view. | None for active turn because rollback is blocked while active. | Persistence layer, Desktop app server |
| Compact context | Context needs summarization | Summarizes prior conversation and continues from compacted state. | May show compaction or progress indicator depending on surface. | Compaction marker and compacted conversation state. | Active compaction task and temporary summary state. | Agent runtime, Persistence layer |
| User shell command | User invokes direct terminal command | Runs command as user-directed activity, optionally associated with active turn. | Command output appears in terminal UI. | Result may be persisted depending on history policy. | Process handle and active command cell. | Terminal UI, Tool runtime |
| Diff display | File edits occurred during turn | Publishes accumulated file-change summary for the turn. | Patch cell and turn-level diff surface. | Diff or file-change records when persisted. | Diff tracker and UI render state. | File edit runtime, Desktop app server, Terminal UI |

## Tests Inspected

The inspected tests define behavior across the main workflow areas rather than only isolated units.

Prompt and run lifecycle coverage includes starting turns, emitting turn-start and turn-complete states, preserving turn identity, handling queued or pending input, restoring drafts, replaying active thread state, and ensuring user input is only accepted into compatible active work.

Agent execution coverage includes streamed assistant output, model completion, context compaction, model retry behavior, provider error classification, and turn failure handling when the model or runtime cannot continue.

Tool execution coverage includes shell command execution, command output streaming, failed commands, no-output commands, sandbox behavior, approval flows, file patch application, patch failures, turn diff tracking, connector-style tool calls, request-for-user-input behavior, permission requests, and unavailable dynamic tools.

Cancellation and interruption coverage includes interrupting active turns, interrupting while tool work is running, preserving interruption markers for future context, clearing pending interactions, finalizing active UI cells, restoring queued or pending input in the terminal UI, and ignoring late events after interruption when appropriate.

Retry and recovery coverage includes retryable stream errors, reconnecting status, transport fallback, non-retryable error propagation, failed turn status, replay after reconnect, pending request cleanup, and resume from persisted conversation history.

UI status coverage includes working and reconnecting indicators, command cells, patch cells, approval overlays, pending approvals after replay, inactive approvals after completion, request-for-input surfaces, interrupted-turn transcript lines, command no-output rendering, and diff rendering snapshots.

Persistence coverage includes transcript reconstruction, resumed threads, ephemeral threads, compaction markers, rollback markers, token usage records, turn boundaries, interruption records, and handling of malformed or partial persisted entries.

Observed coverage gaps and ambiguities are limited to facts visible from the investigation: the exact complete set of client-specific retry, edit, and continue controls is not established as one unified behavior; some external tool surfaces depend on which tools are enabled at runtime; and some persistence behavior varies by history policy, so not every emitted event has the same durability in every mode.

## Ambiguities / Open Questions

The exact visible control set for retry, edit, and continue depends on the client surface. The architecture supports automatic retry, follow-up submission, draft restoration, resume, fork, and rollback, but this investigation did not establish one universal control layout across all clients.

External tool availability is configuration-dependent. Browser-like, web, image, app connector, and dynamic tools are represented in the workflow, but the exact enabled set depends on runtime configuration and client capabilities.

Persistence policy can vary between limited and extended history modes. The report identifies categories of durable and live-only state, but the exact event set persisted for a specific deployment depends on the selected history policy.

Background terminal cleanup is separate from turn interruption. The observed behavior distinguishes interrupting a turn from cleaning background processes, but the exact user-facing lifecycle for every background process shape is client- and command-dependent.

Some connector authorization and elicitation flows are tool-specific. The common pattern is known: request additional input or authorization, then either continue or return cancellation to the model. The exact prompt content and display shape depend on the connector.

Git workflow support is partly metadata-driven and partly command-driven. Thread metadata can include git context, and shell commands can perform git operations under policy, but the exact higher-level branch or commit workflow depends on the surface and user instruction.
