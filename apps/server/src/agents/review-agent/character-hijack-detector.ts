import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import type {
  DecisionProfile,
  ReviewIssue,
  SceneBranch,
  SceneInitialConditions,
} from '@grid-story/schema';
import { z } from 'zod';

export interface CharacterHijackRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

export interface CharacterHijackPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface CharacterHijackInput {
  initialConditions: SceneInitialConditions;
  branch: SceneBranch;
  decisionProfiles: DecisionProfile[];
}

const detectorOutputSchema = z
  .object({
    characterId: z.string(),
    matchScore: z.number().min(0).max(10),
    reason: z.string(),
    flagged: z.boolean(),
  })
  .strict();

export class CharacterHijackDetector {
  constructor(
    private router: CharacterHijackRouter,
    private prompts: CharacterHijackPromptRegistry,
  ) {}

  async check(input: CharacterHijackInput): Promise<ReviewIssue[]> {
    const profiles = new Map(
      input.decisionProfiles.map((profile) => [profile.characterId, profile]),
    );
    const issues: ReviewIssue[] = [];

    for (const justification of input.branch.characterChoiceJustifications) {
      const profile = profiles.get(justification.characterId);
      if (!profile) continue;

      const prompt = this.prompts.render('story-engine', 'character-hijack-detect', {
        context_json: JSON.stringify(
          {
            initialConditions: input.initialConditions,
            branchLabel: input.branch.branchLabel,
            choice: justification,
            decisionProfile: profile,
          },
          null,
          2,
        ),
      });
      const output = await this.router.generate(
        {
          messages: [
            { role: 'system', content: '你是小说人物决策一致性审稿器。只输出 JSON。' },
            { role: 'user', content: prompt },
          ],
          maxTokens: 1024,
          temperature: 0.1,
        },
        'review',
      );

      const parsed = detectorOutputSchema.parse(JSON.parse(extractJson(output.content)));
      const scoreGap = Math.abs(parsed.matchScore - justification.decisionProfileMatchScore);
      if (parsed.flagged || parsed.matchScore < 5 || scoreGap > 3) {
        issues.push({
          dimension: 'character_hijack',
          severity: parsed.matchScore < 4 ? 'major' : 'minor',
          quote: justification.choiceSummary,
          comment: `角色选择可能被剧情推着走：${parsed.reason}`,
          suggestion: '补足外部压力，或改写该角色的选择，让它能被 DecisionProfile 解释。',
        });
      }
    }

    return issues;
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
