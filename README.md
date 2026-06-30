# Prompt Enhancer

一个「发送前提示词增强」工作流。和旧版不同：**增强由你的 AI 会话本体完成**（它能用上
对话历史、打开的文件、项目结构、附带图片等上下文），而不是另起一个看不到上下文的外部模
型。AI 增强后会打开本地网页让你确认/编辑，确认后再按增强提示词执行。

工作方式（skill 触发，无需 hook）：

1. 你调用 `prompt-enhancer` skill 并附上需求。
2. AI 按 `SKILL.md` 的规则，用当前上下文把需求增强成清晰可执行的任务。
3. AI 运行 `prompt-enhancer confirm`，打开本地确认页并阻塞等待。
4. 你在网页检查/编辑，点确认或取消。
5. 确认 → AI 按确认后的提示词执行；取消/超时 → 本次不执行。

## 安装

交互式：

```bash
npx -y github:VankaIn/prompt-enhancer
```

非交互（通过 `skills add` 安装 skill）：

```bash
npx -y github:VankaIn/prompt-enhancer install --agent claude   # 或 codex | cursor | all
```

本地仓库：

```bash
npx skills add /Users/liangjunjie/orca/projects/prompt-enhancer --skill prompt-enhancer
```

检查安装：

```bash
npx -y github:VankaIn/prompt-enhancer doctor
```

## 使用

在 AI 客户端里调用 skill：

```text
$prompt-enhancer 帮我看一下这个登录报错
```

AI 会先增强、再打开确认页，确认后才执行。

## 启动确认服务（一般无需手动）

`confirm` 命令发现服务未启动时会自动后台拉起 `server.js`。手动启动：

```bash
npm install
npm start
```

默认地址：`http://127.0.0.1:4173`。

## confirm 命令（供 skill 调用）

增强由 AI 完成，`confirm` 只负责「展示 + 确认」并把确认结果打到 stdout：

```bash
cat <<'ENHANCED' | npx -y github:VankaIn/prompt-enhancer confirm --original '原始需求'
<AI 增强后的提示词>
ENHANCED
```

## 可选环境变量

- `PROMPT_ENHANCER_PORT=4173`：本地服务端口。
- `PROMPT_ENHANCER_CONFIRM_TIMEOUT_MS=600000`：等待网页确认的最长时间。

## 本地验证

```bash
npm test
```
