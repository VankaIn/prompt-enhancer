# 设计:把 Prompt 增强从「外部模型」搬到「会话内 Claude」

日期:2026-06-30
分支:`feat/enhance-in-session`

## 背景与动机

现状:`/prompt-enhance` 通过 `UserPromptSubmit` hook 拦截,起独立 Node 子进程调
codex/openai 做增强。问题:那个外部模型与项目、IDE 完全隔离,**拿不到 IDE 打开的
文件、对话历史等上下文**,增强质量受限。

ccg 的 `/ccg:enhance` 之所以能用上上下文,是因为增强由 **Claude 本体在会话里做**
(天然有对话历史、能读项目文件)。本次目标:把增强交还给当前 Claude 会话,规则对齐
ccg,触发方式改为 **skill 主动调用**(用户本来就是主动触发),保留网页确认页。

## 核心决策

1. **触发**:删掉 hook,改由 `SKILL.md` 当唯一入口(更接近 ccg 的 slash command)。
2. **增强执行者**:当前 Claude 会话(有上下文),不再调外部模型。
3. **确认**:保留网页确认页;server 退化为「纯展示 + 确认」,不再调模型。
4. **规则**:照搬 ccg `enhance.md`(目标/技术约束/范围边界/验收标准/相关上下文 +
   补全不改变/具体不泛化/简洁/可执行),直接内联进 `SKILL.md`。

## 新数据流

```
用户调 skill(带需求)
  → Claude 读 SKILL.md 规则,用「对话历史 + 可访问的项目文件」做增强
  → Claude 运行阻塞命令:prompt-enhancer confirm --original <X> --enhanced <Y>
       (该命令:建确认记录 → 开浏览器确认页 → 轮询直到确认/取消 → 打印确认后的 prompt)
  → 用户在网页确认 / 修改 / 取消
  → 命令打印确认后的 prompt(或非零退出表示取消)
  → Claude 把打印结果当作真正请求去执行
```

## 职责划分

| 组件 | 职责 |
|------|------|
| `SKILL.md` | 唯一触发入口 + 增强规则 + 三步编排(增强→确认→执行) |
| Claude 会话 | 真正的增强器(有上下文) |
| `prompt-enhancer confirm`(新子命令) | 建确认记录 → 开网页 → 轮询 → 打印结果 |
| `server.js` + `public/review.*` | 纯展示原始 vs 增强 + 确认,不调模型 |
| `lib/confirmation-store.js` | 内存存储待确认记录(不变) |

## 文件变更账本

新增/改:
- `SKILL.md` — 重写:内联 ccg 风格规则 + 「先增强后确认」三步编排。
- `lib/confirm-client.js`(新)— 从原 hook 文件搬出 `confirmPrompt`,签名改为
  `confirmPrompt(originalPrompt, enhancedPrompt)`:POST 已增强文本、开浏览器、轮询、返回确认结果。
- `bin/prompt-enhancer.js` — 删 hook 安装路径(claude/codex/cursor 三套 + 手动 JSON),
  install 改为 **skill-only**;删 `hook`/`enhance` 命令;加 `confirm` 命令;保留
  `start`/`doctor`/`menu`/`install`。
- `server.js` — `POST /api/confirmations` 直接存 `enhancedPrompt`(不调模型);
  删 `POST /api/enhance`;删 `enhancePromptRequest` 引入、`buildEnhancerContext`、session 相关。
- `package.json` — 删 `prompt-enhancer-hook` bin 与 `hook` script。
- `README.md` / `SKILL.md` 文案对齐。

删除:
- `bin/prompt-enhancer-hook.js` — 不再用 hook。
- `lib/prompt-enhancer.js` — 外部模型增强整套作废(SYSTEM_PROMPT/buildFullPrompt/codex/openai)。
- `lib/session-store.js`、`public/index.html`、`public/app.js` — 聊天 demo 作废。
- `shared/command-parser.js` — 仅 hook 使用。
- `test/hook.test.js`、`test/command-parser.test.js`、`test/prompt-enhancer.test.js` — 对应逻辑删除;
  `test/install-cli.test.js` 改为只验证 skill 安装。

## 测试

- 保留 `test/confirmation-store.test.js`。
- 新增 `test/confirm-flow.test.js`:起 server,POST 一条已增强记录 → GET 校验 `enhancedPrompt`
  原样回显(证明 server 不再改写)→ confirm 后状态变更。
- `test/install-cli.test.js`:断言 install 走 `skills add`、不再写 hook 配置。

## 风险

- **可靠性**:依赖 Claude 按 SKILL.md 忠实执行「先增强 → 调 confirm → 执行结果」。
  缓解:SKILL.md 用明确的祈使步骤 + 强调「不要直接执行原始任务」。
- **取消语义**:confirm 命令在取消/超时时非零退出并打印原因,Claude 据此停止。
- **分发影响**:老用户装的是 hook;新版本只装 skill。`doctor` 更新提示。
