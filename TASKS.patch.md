# grid-story 补丁任务

补丁不重排阶段编号,挂在原任务下,以 `TX.Y.Pn.k` 编号(P = patch)。
完成后回填到 `TASKS.md` 对应行的"验收"列里追加一行 ✅,本文件保留作历史。

---

## T2.3.P1 · 角色关系编辑(0.75d)

**背景**:`Character.relationships[]` 在 schema 已定义、`RelationshipGraph` 已能渲染,但角色编辑表单缺失对应字段,导致所有角色实际孤立。本补丁在前端补一个 `relationship-list` 字段类型,Bible CRUD 后端无需改动。

**范围内**:增删改 `relationships`(targetId / type / description),关系图实时反映。
**明确不做**:双向自动镜像、画布拖拽连线、AI 推荐关系。

| ID         | 任务                                                          | 估时  | 依赖       | 验收                                                                 |
| ---------- | ------------------------------------------------------------- | ----- | ---------- | -------------------------------------------------------------------- |
| T2.3.P1.1  | `EntityField['type']` union 增加 `'relationship-list'`        | 0.05d | —          | tsc 通过;新值在 `entity-config.ts` 的 `FieldType` 中可用             |
| T2.3.P1.2  | 新组件 `RelationshipListField.tsx`                            | 0.3d  | P1.1       | 见下方"组件契约";禁用态、空态、删除、新增均工作                      |
| T2.3.P1.3  | `BibleEntityEditor` 渲染分发挂 `'relationship-list'` 分支     | 0.1d  | P1.2       | 在 `renderField` 里加分支;**不要**给该字段挂 `FieldAiPopover` action |
| T2.3.P1.4  | `entityConfigs.character.fields` 末尾追加 `relationships`     | 0.05d | P1.3       | 角色表单出现"人物关系"区块,`span: 'full'`,排在 `notes` 之前          |
| T2.3.P1.5  | `emptyValues` 与提交路径回归确认                              | 0.05d | P1.4       | 新建角色时 `relationships: []`;编辑提交时 strict schema 不报错       |
| T2.3.P1.6  | 端到端手动验收                                                | 0.2d  | P1.5       | 通过下方"端到端验收清单"全部条目                                     |

---

### 组件契约 — `RelationshipListField`

**位置**:`apps/web/src/features/bible/RelationshipListField.tsx`

**Props**:
```ts
{
  bookId: string;
  selfId?: string | null;          // 编辑现有角色时排除自身
  value: CharacterRelationship[];  // 来自 schema
  onChange: (next: CharacterRelationship[]) => void;
  disabled?: boolean;
}
```

**UI**:
- 每条一行,三列并排:
  1. **目标角色**:复用 `EntityRefPicker`,`targetType="character"`,候选过滤掉 `selfId`
  2. **关系类型**:`PixelInput`,placeholder 例「师徒 / 宿敌 / 恋人」
  3. **简述**:`PixelInput`(单行,不要 textarea — 长描述写到角色 notes/background)
- 每行右侧一个删除按钮(`PixelButton variant="ghost"` 或类似)
- 列表底部一个 `+ 添加关系` 按钮,点击 push 一条 `{ targetId: '', type: '', description: '' }`
- 空列表显示提示文字(参考 `RelationshipGraph` 的空态风格)
- 候选下拉里**排除自身**;不强制 `targetId` 非空(允许暂存空行,提交前由 schema 校验或 UI 提示)

**注意**:
- **不**自动生成反向关系(A→B 不会自动加 B→A)
- **不**接 `FieldAiPopover`(本补丁明确不做 AI)
- 渲染顺序 = 数组顺序,不做拖拽排序

---

### 端到端验收清单

在 `BibleStudio` 页面对一本已有 ≥2 个角色的书做以下操作:

- [ ] 给 A 添加一条 `target=B, type=师徒, description=…`,保存,刷新页面后仍存在
- [ ] 关系图出现 A→B 的箭头,边上文字 = "师徒"
- [ ] 编辑该条 type 改成 "敌人",保存,关系图标签更新为 "敌人"
- [ ] 删除该条,关系图边消失
- [ ] target 下拉里不出现 A 自身
- [ ] 同一 A 上并存两条关系(target=B 和 target=C),关系图显示两条边
- [ ] 新建一个全新角色,默认 `relationships: []`,关系图不报错
- [ ] 网络/校验失败时(可断网模拟),不会丢失正在编辑的关系列表

---

### 实现提示

1. **后端零改动**:`character` 的 PUT/POST 路由已经走整体 schema 校验,`relationships` 字段直接通过。
2. **schema 不动**:`packages/schema/src/character.ts` 已有 `characterRelationship`,直接 import 类型即可。
3. **EntityRefPicker 复用**:它已支持按 `bookId` + `targetType` 过滤候选;只需在外层把当前 selfId 排除掉(可在 onChange 时拦截,或传一个 `excludeIds` prop — 视组件现状决定;若需新增 prop,把它一起做掉,改动局限在该组件)。
4. **不要新增 API**:整条 character record PUT 即可。
5. **测试**:无需新增单测;`packages/schema` 已对 `characterSchema` 有覆盖,本补丁是纯 UI 层。
