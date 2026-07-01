# Prompt Enhancer

一个「发送前提示词增强」工作流。增强由你的 AI 会话本体完成——它能用上对话历史、打开的文件、项目结构、附带图片等上下文，而不是另起一个看不到上下文的外部模型。AI 增强后打开本地网页让你确认/编辑，确认后再按增强提示词执行。

## 安装

### 前置依赖

- Node.js 18+（包含 `npm` / `npx`）：`node -v && npm -v`
- Git：`git --version`
- 一个支持 skills 的 AI 客户端：Claude Code / Codex / Cursor
- 能打开本地浏览器：macOS 自带 `open`，Windows 自带 `cmd start`，Linux 需要 `xdg-open`

缺哪个就先补哪个：

```bash
# macOS
brew install node git

# Windows: 安装 Node.js LTS 和 Git for Windows 后，重开终端
node -v
npm -v
git --version

# Linux
sudo apt install nodejs npm git xdg-utils
```

如果安装时报 `skills install failed`，先单独确认 `skills` CLI 可用：

```bash
npx --yes skills --help
```

这个命令失败时，通常是 Node/npm/Git 没装好或不在 PATH；修好后重开终端再安装。

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
