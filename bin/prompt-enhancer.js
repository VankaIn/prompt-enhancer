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

function usage() {
  console.log(`Usage:
  prompt-enhancer                 Open setup panel
  prompt-enhancer install [--agent claude|codex|cursor|all] [--settings <path>] [--local]
  prompt-enhancer hook
  prompt-enhancer start
  prompt-enhancer doctor

Examples:
  npx -y github:VankaIn/prompt-enhancer
  npx github:VankaIn/prompt-enhancer install --agent all
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
  console.log(`node: ${process.version}`);
}

async function menu() {
  if (!process.stdin.isTTY) {
    usage();
    return;
  }

  console.log('\nPrompt Enhancer Setup');
  console.log('发送 /prompt-enhance 或 $prompt-enhance 时，先打开网页确认增强提示词，再交给 AI。\n');
  console.log('A) Claude Code');
  console.log('B) Codex');
  console.log('C) Cursor');
  console.log('D) 全部安装/更新');
  console.log('E) 打印手动配置 JSON');
  console.log('F) 检查当前配置');
  console.log('Q) 退出\n');

  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question('请选择要配置的 Agent [A]: ')).trim().toUpperCase() || 'A';
  rl.close();

  if (answer === 'A') return installAgents(['claude'], []);
  if (answer === 'B') return installAgents(['codex'], []);
  if (answer === 'C') return installAgents(['cursor'], []);
  if (answer === 'D') return installAgents(['all'], []);
  if (answer === 'E') return printManualConfig([]);
  if (answer === 'F') return doctor();
  if (answer === 'Q') return;

  console.log('未知选项。');
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

switch (command || 'menu') {
  case 'menu':
    await menu();
    break;
  case 'install':
    installAgents(parseAgents(args), args);
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
