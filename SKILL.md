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
3. **相关上下文路径** — 涉及的具体文件、模块、函数、API(用名字,别贴整段代码)

增强原则:

- **补全而非改变** — 保留用户原意,只补缺失信息,不要擅自扩大需求。
- **具体而非泛化** — 用具体文件名/函数名/技术栈替代「这个/这里/这段」之类模糊指代;

  vague 指代若指向某张图或某个文件,用上下文把它说清楚。
- **路径原样保留** — 用户原文里出现的文件路径、附件引用(如 `@/abs/path.png`、拖入的文件路径),

  必须**逐字**照搬进增强后的 prompt,一个字符都不许改、不许省略、不许改写成描述。执行的模型要靠这些路径

  去读文件/图片,丢了就打不开。可以在保留路径的同时补充说明它是什么。
- **图片占位符换成真实路径** — `[Image #1]` 这类占位标签执行的模型读不了,必须换成它对应的实际图片路径

  (上下文里形如 `[Image: source: /var/folders/.../xxx.png]` 的那条),把真实路径写进增强后的 prompt。

  找不到对应真实路径时才保留原占位符。
- **简洁而非冗长** — 输出精炼,别堆无用信息。
- **推断路径归位** — 你没用 Read/Glob/Grep 核实过的路径,一律进「相关上下文路径」并注明是推断

  (如「推断,未核实」),不要在正文里当成已确认的事实写。
- **同语言** — 增强后的 prompt 必须与用户原文同语言(中文→中文,英文→英文)。
- 只输出增强后的 prompt 正文,不要加「优化后:」之类前缀、解释或 Markdown 标题。

如何利用上下文(把原则落成动作):

1. prompt 里出现「这个/这里/这段/它」等模糊指代时,用上下文替换成具体的文件名、函数名或模块名。
2. 指代指向某张图或某个文件时,用上下文把它说清楚——文件路径逐字保留;图片若是 `[Image #N]` 占位符,换成其对应的真实路径(见「图片占位符换成真实路径」)。
3. 只描述代码的特征或位置,不要把整段代码贴进增强后的 prompt。
4. 从涉及的技术栈补充恰当的专业术语和约束,但不过度膨胀。

示例(锁定输出颗粒度,别更长也别更短):

- 原始: `分析一下这个逻辑`

  增强: `分析当前 OrderService.settle() 的结算逻辑,说明主流程、数据流向和关键分支,并指出潜在的边界问题。`
- 原始: `这段代码有什么问题`(选中了 UserService.process())

  增强: `检查 UserService.process() 方法的潜在问题,包括空指针风险、资源泄漏、线程安全和性能瓶颈,并给出改进建议。`
- 原始: `照着这个 @/Users/me/design/home.png 实现首页`

  增强: `照着设计稿 @/Users/me/design/home.png 实现首页布局,还原其中的排版、配色与组件结构。`(路径原样保留)

### 2. Open the confirmation page

Send your enhanced prompt to the local review page and **wait** for the user. Pass the

enhanced text on stdin (handles multiline safely) and the raw request via `--original`:

> `**--original` 优先由 UserPromptSubmit hook 自动以逐字原文填充**(装了 hook 时,confirm 会用
>
> hook 落盘的原始字节,忽略你传的值)。你在命令里传的 `--original` 只是**兜底**——仅在没装 hook 的
>
> 环境才生效,此时也必须逐字复制用户最后一条原始输入:一个字都不许改、不许纠错、不许规整(含错别字、
>
> 谐音字、标点、开头的会话 ID、结尾的 `/skill` 触发词)。只有 stdin 里的增强文本才允许由你改写。

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