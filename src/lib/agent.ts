// The agent layer, split by responsibility — this barrel keeps every existing
// `$lib/agent` import working. The modules, bottom-up:
//
//   agent/llm.ts       — transport: rawComplete / visionComplete, retry, errors
//   agent/context.ts   — prompt builders: app context, trends, weekly digest, system
//   agent/tools.ts     — tool schemas + executor, text-action fallback, capture, scrubbers
//   agent/chat.ts      — the agentic loops (chatWithTools: Claude / Ollama)
//   agent/features.ts  — one-shot abilities: lyrics, rhymes, critique, zodiac, queue, nutrition
//   agent/proactive.ts — scheduled: hourly notify, daily zodiac, sync, level-ups, brief/reflection

export * from './agent/llm';
export * from './agent/context';
export * from './agent/tools';
export * from './agent/chat';
export * from './agent/features';
export * from './agent/proactive';
