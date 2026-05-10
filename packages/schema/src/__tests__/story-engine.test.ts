import { describe, expect, it } from 'vitest';
import {
  chekhovHookSchema,
  decisionProfileSchema,
  directorDriveEditorInput,
  directorEventInjectorInput,
  directorHookPlanterInput,
  directorPressureTunerInput,
  directorTensionTunerInput,
  driveSchema,
  pacingEvaluationSchema,
  pacingTargetSchema,
  relationshipSchema,
  sceneInitialConditionsSchema,
  sceneSimulationResultSchema,
  worldVariableSchema,
} from '../index';

const base = {
  id: 'se-1',
  bookId: 'book-1',
  createdAt: '2026-05-06T00:00:00.000Z',
  updatedAt: '2026-05-06T00:00:00.000Z',
  notes: null,
};

const score = {
  conflictDensity: 6,
  emotionalIntensity: 7,
  informationDensity: 4,
  recommendation: null,
};

describe('StoryEngine schemas', () => {
  it('accepts a structured decision profile', () => {
    const result = decisionProfileSchema.safeParse({
      ...base,
      characterId: 'char-1',
      archetype: '务实派',
      responses: [
        {
          triggerType: 'humiliation',
          defaultReaction: '先记账，等对方露出破绽再讨回来。',
          rationale: '他不把面子放在第一位，但绝不吃哑巴亏。',
          intensity: 7,
          exceptions: ['涉及师门声誉时会立刻反击'],
        },
      ],
      hardConstraints: ['绝不伤害无辜孩童'],
      blindSpots: ['被夸判断准时容易上头'],
      growthArcHints: null,
    });

    expect(result.success).toBe(true);
  });

  it('accepts drive, relationship, world variable and hook entities', () => {
    expect(
      driveSchema.safeParse({
        ...base,
        characterId: 'char-1',
        horizon: 'long',
        description: '找出师父失踪真相',
        goalState: '确认师父生死与幕后黑手',
        motivation: '童年承诺与未清的愧疚',
        priority: 9,
        progress: 15,
        status: 'active',
        blockers: ['缺少十年前城门卷宗'],
        evolvedFrom: null,
        createdChapter: 1,
        resolvedChapter: null,
      }).success,
    ).toBe(true);

    expect(
      relationshipSchema.safeParse({
        ...base,
        fromCharacterId: 'char-1',
        toCharacterId: 'char-2',
        relationLabel: '师徒',
        currentTension: { class: -2, info: 1, emotion: 6 },
        targetTrajectory: {
          description: '信任破裂后重新结盟',
          waypoints: [
            {
              label: '第一次怀疑',
              vector: { class: -1, info: -3, emotion: 2 },
              hitAtChapter: null,
            },
          ],
        },
        history: [
          {
            chapter: 1,
            vector: { class: -2, info: 1, emotion: 6 },
            trigger: '开篇关系基线',
          },
        ],
        isPublicKnowledge: false,
      }).success,
    ).toBe(true);

    expect(
      worldVariableSchema.safeParse({
        ...base,
        name: '雪夜城舆论',
        type: 'public_opinion',
        scope: { type: 'region', locationId: 'loc-1' },
        currentValue: '怀疑外乡人',
        scale: [
          { label: '友善', severity: 1 },
          { label: '戒备', severity: 5 },
        ],
        affects: ['提高守城角色对陌生人的威胁反应'],
        history: [],
      }).success,
    ).toBe(true);

    expect(
      chekhovHookSchema.safeParse({
        ...base,
        type: 'hidden_object',
        description: '断剑柄中藏着城门卷宗碎页',
        involvedCharacters: ['char-1'],
        involvedEntities: ['item-1'],
        plantedAtChapter: 1,
        plantedScene: 'scene-1',
        preferredPayoffWindow: { earliestChapter: 3, latestChapter: 6 },
        urgency: 5,
        status: 'planted',
        paidOffAtChapter: null,
        payoffNotes: null,
        source: 'author_planted',
      }).success,
    ).toBe(true);
  });

  it('rejects scene initial conditions that smuggle a preset plot outcome', () => {
    const result = sceneInitialConditionsSchema.safeParse({
      bookId: 'book-1',
      chapterId: 'chapter-1',
      sceneIndex: 0,
      presentCharacterIds: ['char-1'],
      locationId: null,
      timeContext: '次日清晨',
      pressureSources: [],
      authorConstraints: null,
      desiredOutcome: '两人必须决裂',
    });

    expect(result.success).toBe(false);
  });

  it('requires primary branch, at least two alternatives and choice justifications', () => {
    const branch = {
      branchLabel: '主走向',
      narrative: '林听雪没有拔剑，只把断剑横在桌上。',
      stateDelta: {
        relationships: [],
        drives: [],
        worldVariables: [],
        plantedHooks: [],
        paidOffHooks: [],
        causalLinks: [],
      },
      characterChoiceJustifications: [
        {
          characterId: 'char-1',
          choiceSummary: '压住怒火，先套取消息。',
          decisionProfileMatchScore: 8,
          rationale: '符合她先确认事实再动手的习惯。',
        },
      ],
    };

    const result = sceneSimulationResultSchema.safeParse({
      sceneId: 'scene-1',
      initialConditions: {
        bookId: 'book-1',
        chapterId: 'chapter-1',
        sceneIndex: 0,
        presentCharacterIds: ['char-1'],
        locationId: null,
        timeContext: '次日清晨',
        pressureSources: [],
        authorConstraints: null,
      },
      primaryBranch: branch,
      alternativeBranches: [
        { ...branch, branchLabel: '更激烈' },
        { ...branch, branchLabel: '更隐忍' },
      ],
      pacingScore: score,
      modelUsed: 'claude-opus-4-7',
      costTokens: 1200,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a pacing evaluation record', () => {
    const result = pacingEvaluationSchema.safeParse({
      ...base,
      chapterId: 'chapter-1',
      chapterNumber: 1,
      sceneSimulationIds: ['sim-1'],
      score,
      warning: {
        severity: 'warning',
        message: '冲突浓度连续走低，下章建议引入外部压力。',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a pacing target for scene simulation', () => {
    const result = pacingTargetSchema.safeParse({
      conflictTarget: 7,
      emotionalTarget: 6,
      informationTarget: 4,
      hookIds: ['hook-1'],
      paceHint: '下一场需要提高外部压力，并尝试兑现一个接近窗口上限的钩子。',
    });

    expect(result.success).toBe(true);
  });

  it('validates Director intervention inputs', () => {
    expect(
      directorEventInjectorInput.safeParse({
        scope: 'character',
        targetId: 'char-1',
        description: '亲人病危的消息传到城门口',
        preset: '亲人病危',
      }).success,
    ).toBe(true);

    expect(
      directorEventInjectorInput.safeParse({
        scope: 'location',
        targetId: null,
        description: '城门突发戒严',
      }).success,
    ).toBe(false);

    expect(
      directorPressureTunerInput.safeParse({
        worldVariableId: 'wv-1',
        toValue: '全城戒严',
        chapter: 2,
        reason: '作者希望下一场外部压力升高',
      }).success,
    ).toBe(true);

    expect(
      directorDriveEditorInput.safeParse({
        driveId: null,
        characterId: 'char-1',
        horizon: 'short',
        description: '立刻救出被押走的线人',
        goalState: '线人活着脱身',
        motivation: '她欠线人一个人情',
        priority: 9,
        progress: 0,
        status: 'active',
        reason: '强制觉醒新 Drive',
      }).success,
    ).toBe(true);

    expect(
      directorDriveEditorInput.safeParse({
        driveId: null,
        characterId: 'char-1',
        reason: '缺少创建 Drive 的必填字段',
      }).success,
    ).toBe(false);

    expect(
      directorTensionTunerInput.safeParse({
        relationshipId: 'rel-1',
        currentTension: { class: 3, info: -2, emotion: 7 },
        chapter: 2,
        reason: '两人公开翻脸',
      }).success,
    ).toBe(true);

    expect(
      directorHookPlanterInput.safeParse({
        type: 'secret_knowledge',
        description: '城门卷宗里缺了一页',
        involvedCharacters: ['char-1'],
        involvedEntities: [],
        plantedAtChapter: 2,
        plantedScene: null,
        preferredPayoffWindow: { earliestChapter: 4, latestChapter: 6 },
        urgency: 7,
      }).success,
    ).toBe(true);
  });
});
