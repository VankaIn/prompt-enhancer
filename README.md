# Prompt Enhancer Hook

独立的“发送前提示词增强”工作流：用户提交 `/prompt-enhance ...`、`$prompt-enhance ...` 或 `$prompt-enhancer ...` 后，hook 会拦截本次提交，打开本地网页让你确认增强后的提示词；确认后再把增强提示词交给 AI。

## 一键配置面板

推荐给普通用户：

```bash
npx github:VankaIn/prompt-enhancer
```

会进入配置面板：

```text
安装内容：
A) Hook + Skill（推荐，一次装完）
B) 只安装 Hook（提交前拦截）
C) 只安装 Skill（$ 补全/说明）
D) 打印手动配置 JSON
E) 检查当前配置
Q) 退出

选择 Agent：
A) Claude Code
B) Codex
C) Cursor
D) 全部
```

默认回车会走 `Hook + Skill`，再选择具体 Agent。

Hook 会把稳定的在线命令写入对应 Agent 配置：

```bash
npx -y github:VankaIn/prompt-enhancer hook
```

## 用 skills 安装

在线安装：

```bash
npx skills add https://github.com/VankaIn/prompt-enhancer --skill prompt-enhancer
```

本地仓库也可以：

```bash
npx skills add /Users/liangjunjie/orca/projects/prompt-enhancer --skill prompt-enhancer
```

注意：`skills add` 只安装 skill，不会自动改 hook。安装后可以在 AI 客户端里说：

```text
使用 prompt-enhancer skill 帮我安装 hook
```

如果你直接用 `$prompt-enhancer <任务>` 调用 skill，skill 会先运行在线 CLI 打开确认页，确认后才按增强提示词继续执行。

## 启动

```bash
cd /Users/liangjunjie/orca/projects/prompt-enhancer
npm install
npm start
```

默认地址：`http://127.0.0.1:4173`。

> 不手动启动也可以：hook 发现服务没启动时会自动后台启动 `server.js`。

## 配置 Hook

### 非交互配置

本地开发：

```bash
cd /Users/liangjunjie/orca/projects/prompt-enhancer
node bin/prompt-enhancer.js install --agent claude
```

或者用 npx 风格运行本地包：

```bash
npx /Users/liangjunjie/orca/projects/prompt-enhancer install
```

仓库发布后也可以打开配置面板：

```bash
npx github:VankaIn/prompt-enhancer
```

或非交互安装：

```bash
# hook + skill 都装
npx github:VankaIn/prompt-enhancer install --agent codex

# 只装 hook
npx github:VankaIn/prompt-enhancer install --agent codex --component hook

# 只装 skill
npx github:VankaIn/prompt-enhancer install --agent codex --component skill

# 全部 Agent 一次装完
npx github:VankaIn/prompt-enhancer install --agent all
```

Hook 会合并写入对应配置，不会覆盖已有其它 hooks：

- Claude Code: `~/.claude/settings.json`
- Codex: `~/.codex/hooks.json`
- Cursor: `~/.cursor/hooks.json`

Skill 会通过 `npx skills add ... --skill prompt-enhancer` 安装到对应 Agent 的 skill 列表。

可检查配置：

```bash
npx github:VankaIn/prompt-enhancer doctor
```

### 手动配置 Codex / 兼容 CCG hooks.json 的客户端

如果你的客户端使用 `hooks.json`：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y github:VankaIn/prompt-enhancer hook",
            "timeout": 600000
          }
        ]
      }
    ]
  }
}
```

## 使用

在 AI 客户端里直接提交：

```text
/prompt-enhance 帮我看一下这个登录报错
```

或：

```text
$prompt-enhance 帮我优化这个接口设计
```

或：

```text
$prompt-enhancer 帮我优化这个接口设计
```

流程：

1. hook 拦截原始消息；如果是 `$prompt-enhancer` skill 调用，则 skill 先调用 `npx -y github:VankaIn/prompt-enhancer enhance`。
2. 打开本地确认页。
3. 你可以检查/编辑增强后的提示词。
4. 点“确认并发送给 AI”。
5. AI 收到增强后的提示词。

点“取消本次发送”会阻止本次消息继续发送。

## 可选环境变量

- `PROMPT_ENHANCER_PORT=4173`：本地服务端口。
- `PROMPT_ENHANCER_CONFIRM_TIMEOUT_MS=600000`：等待网页确认的最长时间。
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`：设置后优先用 OpenAI-compatible 接口增强；不设置时用本地模板增强。

## 本地验证

```bash
npm test
```
