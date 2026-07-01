# 逐字保真 `--original`：UserPromptSubmit hook 捕获原文

## 背景与问题

`prompt-enhancer` 的确认页有「原始提示词」栏，本应是用户原文对照基准。但该栏的值来自
`confirm --original` 参数，而这个参数**由 AI 手打重构**——skill 拿不到用户键入的原始字节。
AI 在重构时会凭「边界判断」剔除它认为不属于请求正文的内容（如开头的会话 ID、结尾的
`/prompt-enhancer` 触发词），也可能顺手纠正错别字。任何软约束（SKILL.md 里写「逐字复制」）都
赢不了「AI 拿不到原文、只能凭记忆重构」这个底层事实。

## 目标

让 `--original` 100% 逐字保真：由系统在用户提交时捕获原始字节，`confirm` 直接读取，绕过 AI 重构。

## 方案：硬 hook 落盘 + confirm 读盘

### 数据流

```
用户提交含 /prompt-enhancer 的消息
  └─ UserPromptSubmit hook 触发 → 读 stdin JSON，prompt 含触发词?
       └─ 是 → 把【完整原文逐字】写入 <tmpdir>/prompt-enhancer-original.txt
  └─ AI 增强 → 跑 confirm --original '<AI 兜底文本>'
       └─ confirm 发现新鲜 tmp 文件 → 用文件内容当 --original，读后即删
       └─ 无 tmp 文件 / 已过期 → 回退用 AI 传的 --original（现状，向后兼容）
  └─ 网页「原始提示词」= 100% 逐字原文
```

### 决策（已确认）

- **`--original` 优先级**：新鲜 tmp 文件 > `--original` 参数 > enhanced。文件优先、AI 传参兜底。
- **落盘范围**：仅当 prompt 含 `prompt-enhancer` / `/prompt-enhancer` 触发词时才写盘（隐私最小化）。
- **安装范围**：Claude Code + Codex。

## 组件（5 处改动）

1. **`bin/prompt-enhancer-hook.js`（新）** — 读 stdin JSON，取 `prompt` 字段（取不到就整段
   stdin 当文本）；含触发词才写 tmp 文件。**静默失败**，绝不阻断用户输入（异常也 exit 0）。
2. **`confirm` 命令（改 `bin/prompt-enhancer.js`）** — 读原文优先级：新鲜 tmp 文件 >
   `--original` 参数 > enhanced；读后删 tmp 文件。
3. **`install` 命令（改）** — 装 skill 后，把 hook 脚本复制到固定路径 `~/.prompt-enhancer/hook.js`，
   并把 hook 配置**追加**进目标 agent 配置（Claude→`~/.claude/settings.json` 的
   `UserPromptSubmit`；Codex→`~/.codex/hooks.json`）。追加不覆盖现有 hook；重复安装幂等。
4. **`doctor`（改）** — 报告 hook 是否已配置。
5. **`SKILL.md`（改）** — 说明 `--original` 现由 hook 自动提供，AI 填的只是兜底。

## 边界处理

- **npx 冷启动延迟**：hook 配置不走 `npx`（每条 prompt 跑 npx 会拖慢输入），而是
  `node ~/.prompt-enhancer/hook.js` 直接跑，毫秒级。
- **陈旧文件**：tmp 文件按 mtime 判新鲜，`confirm` 只认 10 分钟内的；更早的视为上次未消费的残留，
  忽略并回退 AI 兜底。
- **多会话并发**：全局单文件，同时多会话调用会串。标 `// ponytail: 全局单文件，并发串了再拆
  per-session`——真出问题再改。

## 测试

- hook：含触发词 → 写盘且内容逐字；不含 → 不写。
- confirm：新鲜文件优先于 `--original` 参数；过期文件被忽略；读后删除。
- install：hook 配置追加进 Claude/Codex 配置且幂等，不破坏现有 hook。

## 向后兼容

没装 hook 的环境，tmp 文件不存在 → confirm 回退用 AI 传的 `--original`，行为与现状一致。
