# Prompt Enhancer Hook

独立的“发送前提示词增强”工作流：用户提交 `/prompt-enhance ...` 或 `$prompt-enhance ...` 后，hook 会拦截本次提交，打开本地网页让你确认增强后的提示词；确认后再把增强提示词交给 AI。

## 一键配置面板

推荐给普通用户：

```bash
npx -y github:VankaIn/prompt-enhancer
```

会进入配置面板：

```text
A) 安装/更新 Claude Code hook（推荐）
B) 安装/更新 Claude Code hook（本地路径，开发用）
C) 打印手动配置 JSON
D) 检查当前配置
E) 启动本地服务
Q) 退出
```

默认回车选 A。它会把稳定的在线 hook 命令写入 `~/.claude/settings.json`：

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

注意：`skills add` 只安装 skill，不会自动改 hook。安装后在 AI 客户端里说：

```text
使用 prompt-enhancer skill 帮我安装 hook
```

或者进入安装后的 skill 目录，手动执行：

```bash
node bin/prompt-enhancer.js install
```

## 启动

```bash
cd /Users/liangjunjie/orca/projects/prompt-enhancer
npm install
npm start
```

默认地址：`http://127.0.0.1:4173`。

> 不手动启动也可以：hook 发现服务没启动时会自动后台启动 `server.js`。

## 配置 Hook

### 一键配置 Claude Code

本地直接运行：

```bash
cd /Users/liangjunjie/orca/projects/prompt-enhancer
node bin/prompt-enhancer.js install
```

或者用 npx 风格运行本地包：

```bash
npx --yes /Users/liangjunjie/orca/projects/prompt-enhancer install
```

仓库发布后也可以打开配置面板：

```bash
npx --yes github:VankaIn/prompt-enhancer
```

或非交互安装：

```bash
npx --yes github:VankaIn/prompt-enhancer install
```

它会合并写入 `~/.claude/settings.json`，不会覆盖已有其它 hooks。

可检查配置：

```bash
npx --yes /Users/liangjunjie/orca/projects/prompt-enhancer doctor
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
            "command": "node /Users/liangjunjie/orca/projects/prompt-enhancer/bin/prompt-enhancer.js hook",
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

流程：

1. hook 拦截原始消息。
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
