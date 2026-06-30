---
name: prompt-enhancer
description: Open a local browser confirmation page to enhance a user prompt before the AI acts on it; also install/configure the prompt-enhancer hook and skill for Claude Code, Codex, or Cursor.
---

# prompt-enhancer

Use this skill when the user invokes `$prompt-enhancer`, asks to enhance a prompt before execution, or asks to install/configure/check the prompt-enhancer workflow.

## Critical behavior when invoked with a task

Do **not** execute the user's task directly when this skill is invoked with a normal task/request. The purpose of this skill is to show the enhanced prompt in a browser first.

Instead:

1. Send the user's raw task text to the online CLI and wait for confirmation:

   ```bash
   npx -y github:VankaIn/prompt-enhancer enhance --prompt '<USER_RAW_TASK>'
   ```

   For multiline text, avoid shell-quoting problems by using stdin:

   ```bash
   cat <<'PROMPT' | npx -y github:VankaIn/prompt-enhancer enhance
   <USER_RAW_TASK>
   PROMPT
   ```

2. The command opens a local browser review page. Wait until the user clicks confirm or cancel.
3. If the command fails, times out, or is canceled, stop and report that the prompt was not sent.
4. If the command prints an enhanced prompt, treat that printed prompt as the actual user request and only then proceed.

## Trigger commands after hook installation

After the hook is installed, these messages are intercepted before the AI acts:

```text
/prompt-enhance <prompt>
$prompt-enhance <prompt>
$prompt-enhancer <prompt>
```

The hook opens the same local confirmation page and replaces the original input with the confirmed enhanced prompt.

## Install / configure

For the interactive setup panel, run:

```bash
npx -y github:VankaIn/prompt-enhancer
```

The setup panel first lets the user choose what to install: hook + skill, hook only, or skill only. Then it lets the user choose Claude Code, Codex, Cursor, or all agents.

Non-interactive examples:

```bash
npx -y github:VankaIn/prompt-enhancer install --agent codex
npx -y github:VankaIn/prompt-enhancer install --agent codex --component hook
npx -y github:VankaIn/prompt-enhancer install --agent codex --component skill
npx -y github:VankaIn/prompt-enhancer install --agent all
```

Hook entries are merged without deleting existing hooks. Skills are installed via `npx skills add`.

## Verify

```bash
npx -y github:VankaIn/prompt-enhancer doctor
```

Hook config targets:

- Claude Code: `~/.claude/settings.json`
- Codex: `~/.codex/hooks.json`
- Cursor: `~/.cursor/hooks.json`

Skill install target: the selected agent's skill list, usually under `~/.agents/skills/prompt-enhancer`.
