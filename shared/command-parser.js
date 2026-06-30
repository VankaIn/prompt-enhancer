const COMMAND_RE = /^\s*(?:\/prompt-enhance|\$prompt-enhance|\$prompt-enhancer)\b\s*([\s\S]*)$/i;

export function parsePromptEnhanceCommand(content) {
  const match = String(content || '').match(COMMAND_RE);
  if (!match) {
    return {
      matched: false,
      promptToEnhance: '',
    };
  }

  return {
    matched: true,
    promptToEnhance: (match[1] || '').trim(),
  };
}
