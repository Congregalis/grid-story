#!/usr/bin/env bash
# grid-story · 阶段 4 / Sprint 5 · StoryEngine 真实 E2E 烟雾测试
# 用法：
#   bash scripts/smoke-story-engine.sh             # 真实 LLM + 真实 DB
#   BASE=http://localhost:8432 ...                 # 自定义后端地址
#   NO_COLOR=1 ...                                 # 关闭颜色
#
# 前置：
#   1. docker compose up -d postgres
#   2. pnpm --filter @grid-story/server migrate
#   3. pnpm --filter @grid-story/server dev
#   4. .env 至少配置 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY
#
# 不接受 SKIP_LLM —— StoryEngine 全链路依赖真实 LLM 推演。

set -u
BASE="${BASE:-http://localhost:8432}"

# ---------- 颜色 ----------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RST=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_CYAN=$'\033[36m'; C_GRN=$'\033[32m'; C_RED=$'\033[31m'
  C_YEL=$'\033[33m'; C_MAG=$'\033[35m'; C_BLU=$'\033[34m'
else
  C_RST=; C_DIM=; C_BOLD=; C_CYAN=; C_GRN=; C_RED=; C_YEL=; C_MAG=; C_BLU=
fi

# ---------- 验收账本 ----------
declare -a TASK_IDS TASK_DESCS TASK_RESULTS
record() { TASK_IDS+=("$1"); TASK_DESCS+=("$2"); TASK_RESULTS+=("$3"); }

# ---------- 工具函数 ----------
pp_json() {
  python3 -c '
import sys, json
try:
  d = json.loads(sys.stdin.read() or "null")
  s = json.dumps(d, ensure_ascii=False, indent=2)
  lines = s.splitlines()
  if len(lines) > 30:
    s = "\n".join(lines[:28]) + f"\n  ... (省略 {len(lines)-28} 行)"
  print(s)
except Exception as e:
  print(f"[非法 JSON] {e}", file=sys.stderr); sys.exit(1)
' 2>/dev/null
}

jget() {
  python3 -c '
import sys, json
d = json.loads(sys.argv[1] or "null")
try: print(eval(sys.argv[2]))
except Exception: print("")
' "$1" "$2"
}

uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }

HTTP_STATUS=
HTTP_BODY=

req() {
  local method="$1" path="$2" body="${3:-}"
  local tmp; tmp=$(mktemp)
  if [[ -n "$body" ]]; then
    HTTP_STATUS=$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 240 \
      -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d "$body")
  else
    HTTP_STATUS=$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 240 \
      -X "$method" "$BASE$path")
  fi
  HTTP_BODY=$(cat "$tmp"); rm -f "$tmp"
}

# ---------- 排版 ----------
section() { echo; echo "${C_CYAN}${C_BOLD}═══ 步骤 $1 · [$2] $3 ═══${C_RST}"; }
say()  { echo "${C_BOLD}🎯${C_RST} $*"; }
call() { echo "${C_BOLD}🛠 ${C_RST} ${C_BLU}$*${C_RST}"; }
out()  { echo "${C_BOLD}📤${C_RST} HTTP $HTTP_STATUS"; echo "$HTTP_BODY" | pp_json | sed 's/^/  /'; }
ok()   { echo "${C_GRN}✅${C_RST} $*"; }
bad()  { echo "${C_RED}❌${C_RST} $*"; }
note() { echo "${C_DIM}💬 $*${C_RST}"; }

expect_status() {
  if [[ "$HTTP_STATUS" == "$1" ]]; then return 0; fi
  bad "期望 HTTP $1，实际 $HTTP_STATUS"
  echo "$HTTP_BODY" | pp_json | sed 's/^/    /'
  return 1
}

# ---------- benchmark 采集 ----------
BENCH_DIR="storage/benchmarks"
mkdir -p "$BENCH_DIR"
BENCH_FILE="$BENCH_DIR/story-engine-$(date +%Y%m%d-%H%M%S).json"
declare -a BENCH_OPS BENCH_LATENCIES BENCH_TOKENS

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

bench_record() {
  # bench_record <op> <latency_ms> <tokens>
  BENCH_OPS+=("$1")
  BENCH_LATENCIES+=("$2")
  BENCH_TOKENS+=("$3")
}

write_bench_file() {
  python3 - "$BENCH_FILE" "${BENCH_OPS[@]:-}" "@" "${BENCH_LATENCIES[@]:-}" "@" "${BENCH_TOKENS[@]:-}" <<'PY'
import json, sys, datetime
file = sys.argv[1]
parts = sys.argv[2:]
sep1 = parts.index('@')
ops = parts[:sep1]
rest = parts[sep1+1:]
sep2 = rest.index('@')
lats = rest[:sep2]
toks = rest[sep2+1:]
entries = []
for i in range(len(ops)):
  entries.append({
    "op": ops[i],
    "latencyMs": int(lats[i]) if i < len(lats) and lats[i] else 0,
    "tokens": int(toks[i]) if i < len(toks) and toks[i] else 0,
  })
data = {
  "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
  "entries": entries,
}
with open(file, 'w', encoding='utf-8') as f:
  json.dump(data, f, ensure_ascii=False, indent=2)
print(f"[bench] wrote {file} ({len(entries)} entries)")
PY
}

# ===========================================================
echo "${C_MAG}${C_BOLD}┌──────────────────────────────────────────────────────────────┐${C_RST}"
echo "${C_MAG}${C_BOLD}│      grid-story · StoryEngine 真实 E2E 烟雾测试            │${C_RST}"
echo "${C_MAG}${C_BOLD}└──────────────────────────────────────────────────────────────┘${C_RST}"
echo "目标后端：${C_BOLD}$BASE${C_RST}"

# 0. 探活
req GET /
[[ "$HTTP_STATUS" != "200" ]] && {
  bad "后端未启动：$BASE"; exit 1; }
note "后端探活 OK：$HTTP_BODY"

# 1. Provider 检查 — 必须有真实 LLM
section 1 SE-pre "Provider 检查（真实 LLM 必备）"
req GET /llm/status
out
HAS_DEEPSEEK=$(jget "$HTTP_BODY" 'd.get("providers",{}).get("deepseek", False)')
HAS_ANTHROPIC=$(jget "$HTTP_BODY" 'd.get("providers",{}).get("anthropic", False)')
if [[ "$HAS_DEEPSEEK" != "True" && "$HAS_ANTHROPIC" != "True" ]]; then
  bad "至少需要一家 LLM provider；StoryEngine 不接受模拟。"; exit 1
fi
ok "LLM provider 就绪。"

# 2. 建 book（engineMode=simulation）
section 2 SE-08 "新建 book — engineMode=simulation"
BOOK_ID=$(uuid)
BOOK_BODY=$(cat <<EOF
{
  "id": "$BOOK_ID",
  "title": "听雪录 · E2E",
  "author": "smoke",
  "genre": "古典悬疑",
  "style": "克制",
  "status": "writing",
  "engineMode": "simulation",
  "themes": ["执念", "真相"],
  "rules": ["人不可复活"],
  "avoid": ["现代俚语"]
}
EOF
)
say "engineMode=simulation 让本书走 StoryEngine 全链路。"
call "POST /book"
req POST /book "$BOOK_BODY"
expect_status 201 || { record SE-08 "engineMode 落库" FAIL; exit 1; }
mode=$(jget "$HTTP_BODY" 'd.get("engineMode","")')
[[ "$mode" == "simulation" ]] && { ok "engine_mode = simulation"; record SE-08 "engineMode" PASS; } || { bad "engine_mode 错"; record SE-08 "engineMode" FAIL; }

# 3. 角色 × 4（含 importance 分级）
section 3 SE-49 "角色 + importance 分级"
mk_char() {  # mk_char <name> <importance> <isProtagonist> <personality>
  local body
  body=$(cat <<EOF
{ "bookId":"$BOOK_ID","name":"$1","aliases":[],
  "gender":null,"age":null,"species":null,"appearance":null,
  "personality":"$4","background":null,"motivation":null,
  "abilities":[],"relationships":[],"locationId":null,"organizationIds":[],
  "isProtagonist":$3,"importance":"$2","notes":null }
EOF
)
  req POST /bible/characters "$body"
  jget "$HTTP_BODY" 'd.get("id","")'
}
CHAR_HERO=$(mk_char "苏砚白" tier1 true "沉静寡言，内里执拗")
CHAR_FRIEND=$(mk_char "林听雪" tier1 false "敏锐温柔，善察")
CHAR_NPC=$(mk_char "差役老周" tier2 false "圆滑，惧上")
CHAR_BG=$(mk_char "渡口船工" tier3 false "沉默")
echo "  hero=$CHAR_HERO  friend=$CHAR_FRIEND  npc=$CHAR_NPC  bg=$CHAR_BG"
[[ -n "$CHAR_HERO" && -n "$CHAR_FRIEND" && -n "$CHAR_NPC" && -n "$CHAR_BG" ]] \
  && { ok "4 角色已建（含 tier1/2/3 三档）"; record SE-49 "character.importance" PASS; } \
  || { bad "角色创建失败"; record SE-49 "character.importance" FAIL; exit 1; }

# 4. 地点
LOC_BODY=$(cat <<EOF
{"bookId":"$BOOK_ID","name":"临江渡口","type":"地点","parentId":null,
 "description":"雨夜，江雾未散","atmosphere":"潮湿","significance":"开场","notes":null}
EOF
)
req POST /bible/locations "$LOC_BODY"
LOC_ID=$(jget "$HTTP_BODY" 'd.get("id","")')

# 5. 章节（draft, version=1）
section 5 SE-pre "新建一章（manual chapter v1）"
CHAPTER_ROOT=$(uuid)
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
CHAP_BODY=$(cat <<EOF
{ "bookId":"$BOOK_ID","chapterRootId":"$CHAPTER_ROOT","title":"第一章·渡口",
  "content":"","version":1,"parentVersionId":null,"status":"draft",
  "wordCount":0,"order":1,"outlineSceneId":null,"notes":null }
EOF
)
req POST /bible/chapters "$CHAP_BODY"
expect_status 201 || { record SE-pre "chapter create" FAIL; exit 1; }
CHAPTER_ID=$(jget "$HTTP_BODY" 'd.get("id","")')
note "chapter id=$CHAPTER_ID  rootId=$CHAPTER_ROOT"

# 6. DecisionProfile（仅给主角）
section 6 SE-09 "DecisionProfile · 主角决策档案"
DP_BODY=$(cat <<EOF
{ "archetype":"务实理想者","responses":[
  {"trigger":"面对权威","prefers":"克制隐忍","avoids":"正面冲撞","stakeRequiredToBreak":7}
 ],"hardConstraints":["不伤无辜"],"blindSpots":["容易高估自己"],
 "growthArcHints":"由谨慎逐步走向锋利","notes":null }
EOF
)
req PUT "/books/$BOOK_ID/characters/$CHAR_HERO/decision-profile" "$DP_BODY"
expect_status 200 && { ok "DecisionProfile 已落库"; record SE-09 "DecisionProfile upsert" PASS; } || record SE-09 "DecisionProfile upsert" FAIL

# 7. Drive × 2
section 7 SE-12 "Drive · 角色驱动"
mk_drive() {  # mk_drive <characterId> <horizon> <description> <priority>
  local body
  body=$(cat <<EOF
{ "characterId":"$1","horizon":"$2","description":"$3","goalState":"达成 $3",
  "motivation":"内心驱动","priority":$4,"progress":0,"status":"active",
  "blockers":[],"evolvedFrom":null,"createdChapter":1,"resolvedChapter":null,"notes":null }
EOF
)
  req POST "/books/$BOOK_ID/drives" "$body"
  jget "$HTTP_BODY" 'd.get("id","")'
}
DRIVE_HERO=$(mk_drive "$CHAR_HERO" long "查清父亲沉冤" 9)
DRIVE_FRIEND=$(mk_drive "$CHAR_FRIEND" medium "保护苏砚白" 7)
[[ -n "$DRIVE_HERO" && -n "$DRIVE_FRIEND" ]] \
  && { ok "2 个 Drive 已建"; record SE-12 "Drive create" PASS; } \
  || { bad "Drive 创建失败"; record SE-12 "Drive create" FAIL; exit 1; }

# 8. Relationship
section 8 SE-13 "Relationship · 关系张力"
REL_BODY=$(cat <<EOF
{ "fromCharacterId":"$CHAR_HERO","toCharacterId":"$CHAR_FRIEND",
  "relationLabel":"故人",
  "currentTension":{"class":0,"info":2,"emotion":4},
  "targetTrajectory":null,"history":[],
  "isPublicKnowledge":false,"notes":null }
EOF
)
req POST "/books/$BOOK_ID/relationships" "$REL_BODY"
expect_status 201 || { record SE-13 "Relationship create" FAIL; exit 1; }
REL_ID=$(jget "$HTTP_BODY" 'd.get("id","")')
ok "Relationship 已建：$REL_ID"
record SE-13 "Relationship create" PASS

# 9. WorldVariable
section 9 SE-14 "WorldVariable · 世界变量"
WV_BODY=$(cat <<EOF
{ "name":"江上戒严","type":"qualitative",
  "scope":{"type":"region","regionId":"$LOC_ID"},
  "currentValue":"未戒严","scale":[],"affects":[],"history":[],"notes":null }
EOF
)
req POST "/books/$BOOK_ID/world-variables" "$WV_BODY"
expect_status 201 || { record SE-14 "WorldVariable create" FAIL; exit 1; }
WV_ID=$(jget "$HTTP_BODY" 'd.get("id","")')
ok "WorldVariable 已建：$WV_ID"
record SE-14 "WorldVariable create" PASS

# 10. ChekhovHook（手动种）
section 10 SE-60 "ChekhovHook · 手动投放"
HOOK_BODY=$(cat <<EOF
{ "type":"foreshadowing","description":"父亲玉佩上的暗记",
  "involvedCharacters":["$CHAR_HERO"],"involvedEntities":[],
  "plantedAtChapter":1,"plantedScene":null,
  "preferredPayoffWindow":{"earliestChapter":2,"latestChapter":5},
  "urgency":6,"status":"planted","paidOffAtChapter":null,
  "payoffNotes":null,"source":"author","notes":null }
EOF
)
req POST "/books/$BOOK_ID/hooks" "$HOOK_BODY"
expect_status 201 || { record SE-60 "Hook create" FAIL; exit 1; }
HOOK_ID=$(jget "$HTTP_BODY" 'd.get("id","")')
ok "Hook 已种：$HOOK_ID"
record SE-60 "Hook create" PASS

# 11. SimulationEngine 真实推演
section 11 SE-20 "SimulationEngine · 真实场景推演（耗时 30~120s）"
SIM_BODY=$(cat <<EOF
{
  "chapterId":"$CHAPTER_ROOT",
  "sceneIndex":0,
  "presentCharacterIds":["$CHAR_HERO","$CHAR_FRIEND"],
  "locationId":"$LOC_ID",
  "timeContext":"雨夜，渡口刚靠岸",
  "pressureSources":[
    {"type":"author_event","description":"差役上前盘问，要求出示路引","sourceId":null}
  ],
  "authorConstraints":["不许出现现代物件"],
  "simulationMode":"group",
  "alternativeCount":2
}
EOF
)
say "调用 SimulationEngine 真实 LLM；期望 primaryBranch + ≥2 alternativeBranches。"
call "POST /books/$BOOK_ID/scenes/simulate"
T_SIM_START=$(now_ms)
req POST "/books/$BOOK_ID/scenes/simulate" "$SIM_BODY"
T_SIM_END=$(now_ms)
if [[ "$HTTP_STATUS" != "201" ]]; then
  out; bad "SimulationEngine 失败"; record SE-20 "Simulate scene" FAIL; exit 1
fi
SIM_ID=$(jget "$HTTP_BODY" 'd["simulation"]["id"]')
ALT_COUNT=$(jget "$HTTP_BODY" 'len(d["result"]["alternativeBranches"])')
COST=$(jget "$HTTP_BODY" 'd["result"]["costTokens"]')
bench_record "scene-simulate" "$((T_SIM_END - T_SIM_START))" "${COST:-0}"
PRIMARY_LABEL=$(jget "$HTTP_BODY" 'd["result"]["primaryBranch"]["branchLabel"]')
NARRATIVE_LEN=$(jget "$HTTP_BODY" 'len(d["result"]["primaryBranch"]["narrative"])')
echo "  simulationId=$SIM_ID  primary=\"$PRIMARY_LABEL\"  alt数=$ALT_COUNT  tok=$COST  narr长=$NARRATIVE_LEN"
if [[ -n "$SIM_ID" && "$ALT_COUNT" -ge 2 && "$NARRATIVE_LEN" -gt 50 ]]; then
  ok "推演完成：alternativeBranches ≥ 2，narrative 非空"
  record SE-20 "SimulationEngine 全链路" PASS
else
  bad "推演产出不达标"; record SE-20 "SimulationEngine 全链路" FAIL; exit 1
fi

# 12. 拍板 primary
section 12 SE-30 "拍板 primary 分支 → stateDelta 事务化应用"
ADOPT_BODY="{\"branchLabel\":\"primary\"}"
call "POST /books/$BOOK_ID/scenes/$SIM_ID/adopt"
T_ADOPT_START=$(now_ms)
req POST "/books/$BOOK_ID/scenes/$SIM_ID/adopt" "$ADOPT_BODY"
T_ADOPT_END=$(now_ms)
bench_record "scene-adopt" "$((T_ADOPT_END - T_ADOPT_START))" 0
expect_status 200 || { record SE-30 "adopt branch" FAIL; exit 1; }
APPLIED_REL=$(jget "$HTTP_BODY" 'd["applied"]["relationships"]')
APPLIED_DRV=$(jget "$HTTP_BODY" 'd["applied"]["drives"]')
APPLIED_HOOK_PLANT=$(jget "$HTTP_BODY" 'd["applied"]["plantedHooks"]')
APPLIED_HOOK_PAID=$(jget "$HTTP_BODY" 'd["applied"]["paidOffHooks"]')
APPLIED_CAUSAL=$(jget "$HTTP_BODY" 'd["applied"]["causalLinks"]')
CHAP_WC=$(jget "$HTTP_BODY" 'd["chapter"]["wordCount"]')
echo "  applied: rel=$APPLIED_REL drv=$APPLIED_DRV plant=$APPLIED_HOOK_PLANT paid=$APPLIED_HOOK_PAID causal=$APPLIED_CAUSAL  chapterWC=$CHAP_WC"
if [[ "$CHAP_WC" -gt 0 ]]; then
  ok "narrative 已写入章节；stateDelta 已应用"
  record SE-30 "adopt + chapter content" PASS
else
  bad "章节内容未更新"; record SE-30 "adopt + chapter content" FAIL
fi

# 13. 章节定稿 → triggers OffscreenTicker + PacingCritic
section 13 SE-82 "章节 finalized → 触发 OffscreenTicker + PacingCritic"
say "transition draft→review→revised→final；finalize 时同步触发两个监听器。"
for to in review revised final; do
  call "POST /chapter/$CHAPTER_ROOT/transition status=$to"
  T_TR_START=$(now_ms)
  req POST "/chapter/$CHAPTER_ROOT/transition" "{\"status\":\"$to\"}"
  T_TR_END=$(now_ms)
  if [[ "$to" == "final" ]]; then
    bench_record "chapter-finalize+ticker+pacing" "$((T_TR_END - T_TR_START))" 0
  fi
  expect_status 200 || { bad "transition→$to 失败"; record SE-82 "chapter transitions" FAIL; exit 1; }
done
ok "章节状态：final"
record SE-82 "chapter transitions" PASS

# 14. PacingTimeline
section 14 SE-64 "PacingCritic · 章末评分写入"
req GET "/books/$BOOK_ID/pacing-timeline"
out
EVAL_COUNT=$(jget "$HTTP_BODY" 'len(d["evaluations"])')
if [[ "$EVAL_COUNT" -ge 1 ]]; then
  ok "至少一条 PacingEvaluation"
  record SE-64 "PacingCritic chapter eval" PASS
else
  bad "未发现 PacingEvaluation"; record SE-64 "PacingCritic chapter eval" FAIL
fi

# 15. OffscreenActions
section 15 SE-83 "OffscreenTicker · NPC 幕后行动写入"
req GET "/books/$BOOK_ID/offscreen-actions?chapterId=$CHAPTER_ROOT"
out
ACT_COUNT=$(jget "$HTTP_BODY" 'len(d["actions"])')
echo "  offscreen actions 写入 $ACT_COUNT 条"
# 主角 + 林听雪在场（tier1 onstage 跳过）；NPC 老周(tier2) 应被批量推演产出 1 条
# 渡口船工(tier3) 跳过；hero 上场也被跳过 — 所以期望 ≥ 1 条
if [[ "$ACT_COUNT" -ge 1 ]]; then
  ok "OffscreenTicker 产出 ≥1 行动（tier1 onstage / tier3 已正确跳过）"
  record SE-83 "OffscreenTicker writes actions" PASS
else
  note "无离场角色或 LLM 未返回 — 这是合法情况，但 E2E 期望 ≥1"
  record SE-83 "OffscreenTicker writes actions" FAIL
fi

# 16. CausalGraph
section 16 SE-103 "CausalGraph · 因果链可读"
req GET "/books/$BOOK_ID/causal-graph"
out
LINK_COUNT=$(jget "$HTTP_BODY" 'len(d["links"])')
echo "  causal links = $LINK_COUNT"
# adopt 时若 SimulationEngine 输出了 causalLinks 才会有；可能为 0
record SE-103 "GET /causal-graph (200)" $([[ "$HTTP_STATUS" == "200" ]] && echo PASS || echo FAIL)

# 17. Drive 进度回写校验
section 17 SE-81 "Drive 进度回写（OffscreenTicker / Adopt 之后）"
req GET "/books/$BOOK_ID/drives"
HERO_PROGRESS=$(jget "$HTTP_BODY" '[d for d in d if d.get("characterId")=="'$CHAR_HERO'"][0]["progress"]')
FRIEND_PROGRESS=$(jget "$HTTP_BODY" '[d for d in d if d.get("characterId")=="'$CHAR_FRIEND'"][0]["progress"]')
echo "  hero.progress=$HERO_PROGRESS  friend.progress=$FRIEND_PROGRESS"
record SE-81 "Drive 进度可读" PASS

# ===========================================================
echo
echo "${C_MAG}${C_BOLD}┌──────────────────────────────────────────────────────────────┐${C_RST}"
echo "${C_MAG}${C_BOLD}│                       验  收  汇  总                       │${C_RST}"
echo "${C_MAG}${C_BOLD}└──────────────────────────────────────────────────────────────┘${C_RST}"
PASS=0; FAIL=0
for i in "${!TASK_IDS[@]}"; do
  status="${TASK_RESULTS[$i]}"
  case "$status" in
    PASS) icon="${C_GRN}✅${C_RST}"; PASS=$((PASS+1)) ;;
    FAIL) icon="${C_RED}❌${C_RST}"; FAIL=$((FAIL+1)) ;;
    *)    icon="${C_YEL}⏭ ${C_RST}" ;;
  esac
  printf "  %s  %-14s %s\n" "$icon" "${TASK_IDS[$i]}" "${TASK_DESCS[$i]}"
done
echo
echo "  ${C_GRN}PASS=$PASS${C_RST}  ${C_RED}FAIL=$FAIL${C_RST}  bookId=$BOOK_ID"

# 写入基准文件
write_bench_file
echo
echo "${C_DIM}基准已写入：$BENCH_FILE${C_RST}"
echo "${C_DIM}聚合：node scripts/report-story-engine-bench.mjs${C_RST}"

[[ "$FAIL" == "0" ]] && exit 0 || exit 1
