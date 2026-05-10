import type { DecisionResponse } from '@grid-story/schema';

export interface ArchetypePreset {
  archetype: string;
  hardConstraints: string[];
  blindSpots: string[];
  growthArcHints: string | null;
  responses: DecisionResponse[];
}

export const ARCHETYPE_PRESETS: ArchetypePreset[] = [
  {
    archetype: '务实派',
    hardConstraints: ['不做亏本买卖', '账目必须留底'],
    blindSpots: ['容易低估情感账', '不擅长赌局'],
    growthArcHints: '在一次必须押上情感的事件中开始改写自己的成本观',
    responses: [
      {
        triggerType: 'humiliation',
        defaultReaction: '掏出账本算账，要现银结清',
        rationale: '关系无法量化，就用利益清算止损',
        intensity: 7,
        exceptions: ['对方是亲生骨肉'],
      },
      {
        triggerType: 'opportunity',
        defaultReaction: '先算成本回报再下注',
        rationale: '务实派的本能反应',
        intensity: 8,
        exceptions: [],
      },
    ],
  },
  {
    archetype: '暴烈派',
    hardConstraints: ['不允许被压头', '不藏火气'],
    blindSpots: ['一被点燃就听不进话', '事后才想起代价'],
    growthArcHints: '在一次失控伤到亲近之人后开始学习压火',
    responses: [
      {
        triggerType: 'humiliation',
        defaultReaction: '当场顶回去，必要时动手',
        rationale: '暴烈派的尊严不容压头',
        intensity: 9,
        exceptions: ['对方是更大势力'],
      },
      {
        triggerType: 'threat',
        defaultReaction: '亮明武力立威',
        rationale: '反击是惯性',
        intensity: 8,
        exceptions: [],
      },
    ],
  },
  {
    archetype: '隐忍派',
    hardConstraints: ['不留把柄', '不在外人前失态'],
    blindSpots: ['对自己也压抑', '错过表态时机'],
    growthArcHints: '在一次必须公开表态的危机中突破隐忍习惯',
    responses: [
      {
        triggerType: 'humiliation',
        defaultReaction: '微笑收下，背后记账',
        rationale: '不给敌人立刻反扑的口实',
        intensity: 6,
        exceptions: ['辱及挚友'],
      },
      {
        triggerType: 'betrayal',
        defaultReaction: '装作未察觉，等待时机',
        rationale: '隐忍派惯用的手段',
        intensity: 7,
        exceptions: [],
      },
    ],
  },
  {
    archetype: '阴谋派',
    hardConstraints: ['不留下指向自己的痕迹', '永远多备一手'],
    blindSpots: ['过度推演他人动机', '对真情实意反应不过来'],
    growthArcHints: '在一段无法用算计解释的关系中暴露破绽',
    responses: [
      {
        triggerType: 'opportunity',
        defaultReaction: '让别人冲在前面',
        rationale: '永远把代价推到第三方',
        intensity: 8,
        exceptions: [],
      },
      {
        triggerType: 'unknown_info',
        defaultReaction: '布局多重信息源交叉验证',
        rationale: '不被单一信息源欺骗',
        intensity: 9,
        exceptions: [],
      },
    ],
  },
];
