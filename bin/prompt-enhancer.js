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
  prompt-enhancer install [--settings <path>] [--local]
  prompt-enhancer hook
  prompt-enhancer start
  prompt-enhancer doctor

Examples:
  npx -y github:VankaIn/prompt-enhancer
  npx -y github:VankaIn/prompt-enhancer install
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

function settingsPathFrom(args = []) {
  return path.resolve(argValue(args, '--settings') || path.join(os.homedir(), '.claude', 'settings.json'));
}

function installClaude(args = []) {
  const settingsPath = settingsPathFrom(args);
  const command = hookCommand(args);

  const settings = readJson(settingsPath);
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

  cleaned.push({
    hooks: [{ type: 'command', command, timeout: 600000 }],
  });

  settings.hooks = { ...hooks, UserPromptSubmit: cleaned };
  writeJson(settingsPath, settings);

  console.log(`\n✓ Installed prompt-enhancer hook\n  settings: ${settingsPath}\n  command:  ${command}\n`);
}

function printManualConfig(args = []) {
  console.log(JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: hookCommand(args), timeout: 600000 }] },
      ],
    },
  }, null, 2));
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function doctor() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = readJson(settingsPath);
  const userPromptSubmit = settings.hooks?.UserPromptSubmit || [];
  const installed = JSON.stringify(userPromptSubmit).includes('prompt-enhancer');
  console.log(`root: ${rootDir}`);
  console.log(`hook: ${hookPath}`);
  console.log(`online hook command: ${onlineHookCommand}`);
  console.log(`claude settings: ${settingsPath}`);
  console.log(`claude hook installed: ${installed ? 'yes' : 'no'}`);
  console.log(`node: ${process.version}`);
}

async function menu() {
  if (!process.stdin.isTTY) {
    usage();
    return;
  }

  console.log('\nPrompt Enhancer Setup');
  console.log('发送 /prompt-enhance 或 $prompt-enhance 时，先打开网页确认增强提示词，再交给 AI。\n');
  console.log('A) 安装/更新 Claude Code hook（推荐，在线 npx 命令）');
  console.log('B) 安装/更新 Claude Code hook（本地路径，开发用）');
  console.log('C) 打印手动配置 JSON');
  console.log('D) 检查当前配置');
  console.log('E) 启动本地服务');
  console.log('Q) 退出\n');

  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question('请选择 [A]: ')).trim().toUpperCase() || 'A';
  rl.close();

  if (answer === 'A') return installClaude([]);
  if (answer === 'B') return installClaude(['--local']);
  if (answer === 'C') return printManualConfig([]);
  if (answer === 'D') return doctor();
  if (answer === 'E') return runNode(path.join(rootDir, 'server.js'));
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
    installClaude(args);
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
