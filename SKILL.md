---
name: prompt-enhancer
description: Enhance a vague user request into a clear, executable task using your conversation and project context, show it in a local browser confirmation page, and only act on the confirmed prompt. Also installs/configures the skill.
---

# prompt-enhancer

Use this skill when the user invokes `prompt-enhancer` / `$prompt-enhancer`, asks to
enhance a prompt before execution, or asks to install/configure the workflow.

## Critical behavior

When invoked with a task, do **not** execute the task directly. Your job is to first
**enhance** the request yourself (you have the context an external model lacks), then
show it in a browser for confirmation, and only act on the confirmed prompt.

## Process

### 1. Enhance the prompt (you do this, with context)

You are the **Prompt Enhancer**. Turn the user's raw request into a clear, executable
task. Use everything you can see: the conversation history, open/edited files, the
project structure, and any attached images.

Identify intent, missing details, implicit assumptions, and context clues. Then produce
an enhanced prompt that covers:

1. **明确目标** — 具体要实现/排查什么
2. **验收标准** — 如何判断完成
3. **相关上下文** — 涉及的具体文件、模块、函数、API(用名字,别贴整段代码)

增强原则:
- **补全而非改变** — 保留用户原意,只补缺失信息,不要擅自扩大需求。
- **具体而非泛化** — 用具体文件名/函数名/技术栈替代「这个/这里/这段」之类模糊指代;
  vague 指代若指向某张图或某个文件,用上下文把它说清楚。
- **简洁而非冗长** — 输出精炼,别堆无用信息。
- **同语言** — 增强后的 prompt 必须与用户原文同语言(中文→中文,英文→英文)。
- 只输出增强后的 prompt 正文,不要加「优化后:」之类前缀、解释或 Markdown 标题。

### 2. Open the confirmation page

Send your enhanced prompt to the local review page and **wait** for the user. Pass the
enhanced text on stdin (handles multiline safely) and the raw request via `--original`:

> **`--original` 必须逐字复制用户最后一条原始输入**——一个字都不许改、不许纠错、不许规整
> (包括错别字、语音转文字的谐音字、标点)。这栏是给用户做原文对照的基准,任何清洗都会让对照失真。
> 只有 stdin 里的增强文本才允许由你改写。

```bash
cat <<'ENHANCED' | npx -y github:VankaIn/prompt-enhancer confirm --original '<USER_RAW_TASK>'
<YOUR_ENHANCED_PROMPT>
ENHANCED
```

The command opens a local browser page showing the original vs. your enhanced prompt,
then blocks until the user confirms (optionally editing it) or cancels.

### 3. Act on the result

- The command prints the confirmed prompt on stdout → treat **that** as the actual user
  request and proceed to execute it.
- The command fails / times out / is canceled (non-zero exit) → stop and report that the
  prompt was not sent. Do not fall back to the original task.

## Install / configure

Interactive setup:

```bash
npx -y github:VankaIn/prompt-enhancer
```

Non-interactive (skill is installed via `npx skills add`):

```bash
npx -y github:VankaIn/prompt-enhancer install --agent claude   # or codex | cursor | all
```

## Verify

```bash
npx -y github:VankaIn/prompt-enhancer doctor
```

Skill install target: the selected agent's skill list, usually under
`~/.agents/skills/prompt-enhancer`.
