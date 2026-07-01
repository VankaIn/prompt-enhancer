#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

import { confirmPrompt } from '../lib/confirm-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'bin', 'prompt-enhancer.js');
const skillSource = 'https://github.com/VankaIn/prompt-enhancer';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function usage() {
  console.log(`Usage:
  prompt-enhancer                 Open setup panel (install skill)
  prompt-enhancer install [--agent claude|codex|cursor|all] [--dry-run]
  prompt-enhancer confirm --original <text> --enhanced <text>
  prompt-enhancer start
  prompt-enhancer doctor

Notes:
  Enhancement is done in-session by your AI agent (it has your conversation and
  project context). 'confirm' only opens the local review page for an already
  enhanced prompt and prints the confirmed result on stdout.

Examples:
  npx -y github:VankaIn/prompt-enhancer
  npx github:VankaIn/prompt-enhancer install --agent all
  cat enhanced.txt | npx github:VankaIn/prompt-enhancer confirm --original '原始需求'
  node ${cliPath} install --dry-run`);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
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
    console.log(`DRY RUN: ${npxCommand} ${command.join(' ')}`);
    return;
  }

  const result = spawnSync(npxCommand, command, { stdio: 'inherit' });
  if ((result.status ?? 1) !== 0) {
    const detail = result.error ? `: ${result.error.message}` : `: exit ${result.status ?? 1}`;
    throw new Error(`skills install failed${detail}`);
  }
}

function parseAgents(args = []) {
  const value = argValue(args, '--agent') || argValue(args, '-a');
  if (!value) return ['claude'];
  return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

async function confirmOnce(args = []) {
  const original = String(argValue(args, '--original') || argValue(args, '-o') || '').trim();
  let enhanced = argValue(args, '--enhanced') || argValue(args, '-e');
  if (!enhanced && !process.stdin.isTTY) {
    enhanced = fs.readFileSync(0, 'utf8');
  }
  enhanced = String(enhanced || '').trim();
  if (!enhanced) {
    console.error('missing enhanced prompt: use --enhanced <text> or pipe it on stdin');
    process.exit(1);
  }

  try {
    const confirmed = await confirmPrompt(original || enhanced, enhanced);
    console.log(confirmed);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'prompt-enhancer failed');
    process.exit(1);
  }
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function hasPromptEnhancerHook(file) {
  return JSON.stringify(readJson(file)).includes('prompt-enhancer');
}

function doctor() {
  const claude = path.join(os.homedir(), '.claude', 'settings.json');
  const skillDir = path.join(os.homedir(), '.agents', 'skills', 'prompt-enhancer', 'SKILL.md');
  console.log(`root: ${rootDir}`);
  console.log(`skill: ${fs.existsSync(skillDir) ? 'installed' : 'not installed'} (~/.agents/skills/prompt-enhancer)`);
  console.log(`node: ${process.version}`);
  if (hasPromptEnhancerHook(claude)) {
    console.log('note: a legacy prompt-enhancer hook is still in ~/.claude/settings.json; it is no longer used and can be removed.');
  }
}

async function menu() {
  if (!process.stdin.isTTY) {
    usage();
    return;
  }

  console.log('\nPrompt Enhancer Setup');
  console.log('调用 prompt-enhancer skill：AI 会用对话/项目上下文增强提示词，再打开网页确认。\n');
  console.log('选择 Agent：');
  console.log('A) Claude Code');
  console.log('B) Codex');
  console.log('C) Cursor');
  console.log('D) 全部');
  console.log('E) 检查当前配置');
  console.log('Q) 退出\n');

  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question('请选择 [A]: ')).trim().toUpperCase() || 'A';
  rl.close();

  if (answer === 'E') return doctor();
  if (answer === 'Q') return;

  const agents = answer === 'B' ? ['codex'] : answer === 'C' ? ['cursor'] : answer === 'D' ? ['all'] : ['claude'];
  return installSkillAgents(agents);
}

const [command, ...args] = process.argv.slice(2);

switch (command || 'menu') {
  case 'menu':
    await menu();
    break;
  case 'install':
    installSkillAgents(parseAgents(args), args);
    break;
  case 'confirm':
    await confirmOnce(args);
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
