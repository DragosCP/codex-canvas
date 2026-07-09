# Security Policy

## Reporting Security Issues

Please do not open a public issue with exploit details, tokens, private logs, or reproduction steps that expose another user's machine or project.

For this repository, use GitHub's private vulnerability reporting if it is enabled. If it is not enabled, open a short public issue asking for a private security contact path and include only a high-level description.

For vulnerabilities in upstream OpenAI Codex itself, use OpenAI's published security reporting process.

## Scope

This project is a local desktop app built on top of the Codex runtime. Security-sensitive areas include:

- local project file access;
- command execution and approval flows;
- sandbox and permission boundaries;
- local preview/webview isolation;
- native sidecar launch and IPC;
- authentication and account state handling.

## Safe Operation

Treat local projects and prompts as sensitive. Review commands and file changes before approving them, and avoid opening untrusted preview URLs inside the desktop app.
