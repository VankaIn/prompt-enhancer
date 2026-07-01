# Prompt Enhancer

一个「发送前提示词增强」工作流。增强由你的 AI 会话本体完成——它能用上对话历史、打开的文件、项目结构、附带图片等上下文，而不是另起一个看不到上下文的外部模型。AI 增强后打开本地网页让你确认/编辑，确认后再按增强提示词执行。

## 安装

交互式：

```bash
npx -y github:VankaIn/prompt-enhancer
```

指定客户端（`claude` | `codex` | `cursor` | `all`）：

```bash
npx -y github:VankaIn/prompt-enhancer install --agent claude
```

## 使用

在 AI 客户端里调用 skill，附上需求：

```text
$prompt-enhancer 帮我看一下这个登录报错
```

AI 会先用当前上下文把需求增强成清晰可执行的任务，再打开本地确认页阻塞等待。你在网页检查/编辑后点确认或取消：确认 → 按确认后的提示词执行；取消/超时 → 本次不执行。
