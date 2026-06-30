#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'bin', 'prompt-enhancer.js');
const hookPath = path.join(rootDir, 'bin', 'prompt-enhancer-hook.js');

function usage() {
  console.log(`Usage:
  prompt-enhancer install [--settings <path>] [--use-npx]
  prompt-enhancer hook
  prompt-enhancer start
  prompt-enhancer doctor

Examples:
  node ${path.join(rootDir, 'bin', 'prompt-enhancer.js')} install
  npx prompt-enhancer install --use-npx`);
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

function installClaude(args) {
  const settingsPath = path.resolve(
    argValue(args, '--settings') || path.join(os.homedir(), '.claude', 'settings.json')
  );
  const useNpx = args.includes('--use-npx');
  const command = useNpx
    ? 'npx -y prompt-enhancer hook'
    : `node ${cliPath} hook`;

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

  console.log(`Installed prompt-enhancer hook:\n  ${settingsPath}\n  ${command}`);
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function doctor() {
  console.log(`root: ${rootDir}`);
  console.log(`hook: ${hookPath}`);
  console.log(`claude settings: ${path.join(os.homedir(), '.claude', 'settings.json')}`);
  console.log(`node: ${process.version}`);
}

const [command, ...args] = process.argv.slice(2);

switch (command || 'help') {
  case 'install':
    installClaude(args);
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
