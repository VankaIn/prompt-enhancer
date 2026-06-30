---
name: prompt-enhancer
description: Install and operate a local UserPromptSubmit hook that opens a browser confirmation page, lets the user approve an enhanced prompt, then sends the approved prompt to the AI instead of the raw /prompt-enhance command.
---

# prompt-enhancer

Use this skill when the user wants to install, configure, verify, or use the local prompt-enhancer workflow.

## What this skill provides

- A local `UserPromptSubmit` hook.
- Trigger commands: `/prompt-enhance <prompt>` and `$prompt-enhance <prompt>`.
- A local browser confirmation page before the prompt reaches the AI.
- Confirmation sends the enhanced prompt; cancellation blocks the original submission.

## Install / configure

From this skill directory, run:

```bash
node bin/prompt-enhancer.js install
```

This merges a hook entry into `~/.claude/settings.json` without deleting existing hooks.

## Verify

```bash
node bin/prompt-enhancer.js doctor
npm test
```

## Start manually

Manual start is optional because the hook auto-starts the server when needed.

```bash
node bin/prompt-enhancer.js start
```

## Usage

After installing the hook, submit one of these in the AI client:

```text
/prompt-enhance 帮我看一下这个登录报错
```

```text
$prompt-enhance 帮我优化这个接口设计
```

The hook opens a local review page. The user can edit the enhanced prompt and click confirm. The AI receives the confirmed enhanced prompt, not the original command.
