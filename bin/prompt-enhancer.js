#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'bin', 'prompt-enhancer.js');
const hookPath = path.join(rootDir, 'bin', 'prompt-enhancer-hook.js');
const onlineHookCommand = 'npx -y github:VankaIn/prompt-enhancer hook';
const skillSource = 'https://github.com/VankaIn/prompt-enhancer';

function usage() {
  console.log(`Usage:
  prompt-enhancer                 Open setup panel
  prompt-enhancer install [--agent claude|codex|cursor|all] [--component all|hook|skill] [--settings <path>] [--local]
  prompt-enhancer hook
  prompt-enhancer start
  prompt-enhancer doctor

Examples:
  npx -y github:VankaIn/prompt-enhancer
  npx github:VankaIn/prompt-enhancer install --agent all
  npx github:VankaIn/prompt-enhancer install --agent codex --component skill
  node ${cliPath} install --local`);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function hookCommand(args = []) {
  if (args.includes('--local')) return `node ${cliPath} hook`;
  return argValue(args, '--command') || onlineHookCommand;
}

function claudeSettingsPath(args = []) {
  return path.resolve(argValue(args, '--settings') || path.join(os.homedir(), '.claude', 'settings.json'));
}

function codexHooksPath(args = []) {
  return path.resolve(argValue(args, '--settings') || path.join(os.homedir(), '.codex', 'hooks.json'));
}

function cursorHooksPath(args = []) {
  return path.resolve(argValue(args, '--settings') || path.join(os.homedir(), '.cursor', 'hooks.json'));
}

function mergeNestedUserPromptHook(file, command) {
  const settings = readJson(file);
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  const userPromptSubmit = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];

  const cleaned = userPromptSubmit
    .map((entry) => ({
      ...entry,
      hooks: Array.isArray(entry?.hooks)
        ? entry.hooks.filter((hook) => !String(hook?.command || '').includes('prompt-enhancer'))
        : [],
    }))
    .filter((entry) => entry.hooks.length > 0 || entry.matcher);

  cleaned.push({ hooks: [{ type: 'command', command, timeout: 600000 }] });
  settings.hooks = { ...hooks, UserPromptSubmit: cleaned };
  writeJson(file, settings);
}

function mergeFlatHook(file, eventName, command) {
  const settings = readJson(file);
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  const eventHooks = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
  hooks[eventName] = [
    ...eventHooks.filter((hook) => !String(hook?.command || '').includes('prompt-enhancer')),
    { command, timeout: 600000 },
  ];
  settings.version = settings.version || 1;
  settings.hooks = hooks;
  writeJson(file, settings);
}

function installClaude(args = []) {
  const file = claudeSettingsPath(args);
  const command = hookCommand(args);
  mergeNestedUserPromptHook(file, command);
  console.log(`✓ Claude Code hook installed\n  settings: ${file}\n  command:  ${command}`);
}

function installCodex(args = []) {
  const file = codexHooksPath(args);
  const command = hookCommand(args);
  mergeNestedUserPromptHook(file, command);
  console.log(`✓ Codex hook installed\n  settings: ${file}\n  command:  ${command}`);
}

function installCursor(args = []) {
  const file = cursorHooksPath(args);
  const command = hookCommand(args);
  mergeFlatHook(file, 'beforeSubmitPrompt', command);
  console.log(`✓ Cursor hook installed\n  settings: ${file}\n  command:  ${command}`);
}

function installAgents(agents, args = []) {
  const selected = agents.includes('all') ? ['claude', 'codex', 'cursor'] : agents;
  for (const agent of selected) {
    if (agent === 'claude' || agent === 'claude-code') installClaude(args);
    else if (agent === 'codex') installCodex(args);
    else if (agent === 'cursor') installCursor(args);
    else throw new Error(`unknown agent: ${agent}`);
  }
}

function skillAgentName(agent) {
  if (agent === 'claude' || agent === 'claude-code') return 'claude-code';
  if (agent === 'codex') return 'codex';
  if (agent === 'cursor') return 'cursor';
  throw new Error(`unknown agent: ${agent}`);
}

function installSkillAgents(agents, args = []) {
  const selected = agents.includes('all') ? ['claude', 'codex', 'cursor'] : agents;
  const skillAgents = selected.map(skillAgentName);
  const command = ['--yes', 'skills', 'add', skillSource, '--skill', 'prompt-enhancer', '-g', '-a', ...skillAgents, '-y'];

  if (args.includes('--dry-run') || process.env.PROMPT_ENHANCER_DRY_RUN_SKILLS === '1') {
    console.log(`DRY RUN: npx ${command.join(' ')}`);
    return;
  }

  const result = spawnSync('npx', command, { stdio: 'inherit' });
  if ((result.status ?? 1) !== 0) {
    throw new Error('skills install failed');
  }
}

function parseComponent(args = []) {
  return (argValue(args, '--component') || argValue(args, '-c') || 'all').toLowerCase();
}

function installSelected(agents, args = []) {
  const component = parseComponent(args);
  if (component === 'all') {
    installAgents(agents, args);
    installSkillAgents(agents, args);
    return;
  }
  if (component === 'hook') return installAgents(agents, args);
  if (component === 'skill' || component === 'skills') return installSkillAgents(agents, args);
  throw new Error(`unknown component: ${component}`);
}

function parseAgents(args = []) {
  const value = argValue(args, '--agent') || argValue(args, '-a');
  if (!value) return ['claude'];
  return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function printManualConfig(args = []) {
  const command = hookCommand(args);
  console.log('Claude Code / Codex hooks.json:');
  console.log(JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command, timeout: 600000 }] },
      ],
    },
  }, null, 2));
  console.log('\nCursor ~/.cursor/hooks.json:');
  console.log(JSON.stringify({
    version: 1,
    hooks: { beforeSubmitPrompt: [{ command, timeout: 600000 }] },
  }, null, 2));
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function hasPromptEnhancer(file) {
  return JSON.stringify(readJson(file)).includes('prompt-enhancer');
}

function doctor() {
  const claude = path.join(os.homedir(), '.claude', 'settings.json');
  const codex = path.join(os.homedir(), '.codex', 'hooks.json');
  const cursor = path.join(os.homedir(), '.cursor', 'hooks.json');
  console.log(`root: ${rootDir}`);
  console.log(`hook: ${hookPath}`);
  console.log(`online hook command: ${onlineHookCommand}`);
  console.log(`claude code: ${hasPromptEnhancer(claude) ? 'installed' : 'not installed'} (${claude})`);
  console.log(`codex:       ${hasPromptEnhancer(codex) ? 'installed' : 'not installed'} (${codex})`);
  console.log(`cursor:      ${hasPromptEnhancer(cursor) ? 'installed' : 'not installed'} (${cursor})`);
  console.log(`skill:       ${fs.existsSync(path.join(os.homedir(), '.agents', 'skills', 'prompt-enhancer', 'SKILL.md')) ? 'installed' : 'not installed'} (~/.agents/skills/prompt-enhancer)`);
  console.log(`node: ${process.version}`);
}

async function menu() {
  if (!process.stdin.isTTY) {
    usage();
    return;
  }

  console.log('\nPrompt Enhancer Setup');
  console.log('发送 /prompt-enhance 或 $prompt-enhance 时，先打开网页确认增强提示词，再交给 AI。\n');
  console.log('安装内容：');
  console.log('A) Hook + Skill（推荐，一次装完）');
  console.log('B) 只安装 Hook（提交前拦截）');
  console.log('C) 只安装 Skill（$ 补全/说明）');
  console.log('D) 打印手动配置 JSON');
  console.log('E) 检查当前配置');
  console.log('Q) 退出\n');

  const rl = readline.createInterface({ input, output });
  const componentAnswer = (await rl.question('请选择安装内容 [A]: ')).trim().toUpperCase() || 'A';
  if (componentAnswer === 'D') { rl.close(); return printManualConfig([]); }
  if (componentAnswer === 'E') { rl.close(); return doctor(); }
  if (componentAnswer === 'Q') { rl.close(); return; }

  console.log('\n选择 Agent：');
  console.log('A) Claude Code');
  console.log('B) Codex');
  console.log('C) Cursor');
  console.log('D) 全部');
  const agentAnswer = (await rl.question('请选择 Agent [A]: ')).trim().toUpperCase() || 'A';
  rl.close();

  const component = componentAnswer === 'B' ? 'hook' : componentAnswer === 'C' ? 'skill' : 'all';
  const agents = agentAnswer === 'B' ? ['codex'] : agentAnswer === 'C' ? ['cursor'] : agentAnswer === 'D' ? ['all'] : ['claude'];
  return installSelected(agents, ['--component', component]);

  console.log('未知选项。');
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

switch (command || 'menu') {
  case 'menu':
    await menu();
    break;
  case 'install':
    installSelected(parseAgents(args), args);
    break;
  case 'config':
    printManualConfig(args);
    break;
  case 'hook':
    runNode(hookPath, args);
    break;
  case 'start':
    runNode(path.join(rootDir, 'server.js'), args);
    break;
  case 'doctor':
    doctor();
    break;
  case 'help':
  case '--help':
  case '-h':
    usage();
    break;
  default:
    usage();
    process.exit(1);
}
