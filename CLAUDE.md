# Guidelines

Project context: see `## 5` below for required reading.

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. Project Context (grid-story)

**What**: AI 辅助小说创作工具。Product shape = **human–AI co-creation + long-form serialization**. Frontend is **PixiJS pixel-anime**.

**Required reading before any task**:
- `DESIGN.md` — module breakdown across 8 layers
- `TASKS.md` — task IDs (`T0.1` .. `T5.4`), dependencies, acceptance criteria
- `STACK.md` — chosen tech stack and why

Every task must map to a `TASKS.md` ID. If it doesn't, surface it before coding.

## 6. Hard Rules (do not override without explicit user approval)

1. **Editor = TipTap. PixiJS is only for `Reader`, character portraits, decoration, transitions.**
   Canvas can't handle IME / native selection / annotation anchors. Don't try.

2. **No LangChain / Vercel AI SDK / llama-index / instructor.**
   `ContextComposer` is the system's heart and must be a thin self-written layer.
   Anthropic → native `@anthropic-ai/sdk`. Deepseek / OpenRouter → `openai` SDK with custom `baseURL`.

3. **One database: Postgres + pgvector.** Don't propose Qdrant / Weaviate / Pinecone.

4. **Bible schema = Zod in `packages/schema`, shared frontend ↔ backend.**
   Never duplicate the type on the other side. `notes` is the only free-form field.

5. **`ModelRouter` stays multi-provider** (Anthropic + OpenAI-protocol family). Never hardcode to one vendor.

6. **Prompt templates live as versioned `.md` files** under `packages/prompts/<agent>/<task>.v<n>.md`. Don't inline long prompts in code.

## 7. Design Principles (refer back when in doubt)

Every architectural choice must serve at least one of:
1. **Long-form** → layered memory (structured Bible + rolling summary + hybrid retrieval)
2. **Co-creation** → stateful, reversible, annotatable; author has the final word
3. **Serialized** → semi-automatic per-chapter pipeline, not batch generation

If a proposed feature serves none of these, it's likely scope creep — surface before building.