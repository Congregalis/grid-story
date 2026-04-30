import { useState, type ReactNode } from 'react';
import {
  PixelButton,
  PixelDialog,
  PixelInput,
  PixelList,
  PixelListItem,
  PixelScrollArea,
  PixelTextArea,
} from '@grid-story/pixel-kit';

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-pixel text-pixel-md mb-1">{title}</h2>
      {caption != null && (
        <p className="font-ui text-sm text-ink-soft mb-4">{caption}</p>
      )}
      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6">
        {children}
      </div>
    </section>
  );
}

export default function Showcase() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState('在城墙的阴影里，他第一次看见自己的影子有了重量。');
  const [active, setActive] = useState<string>('lin');
  const [dialogOpen, setDialogOpen] = useState(false);

  const characters = [
    { id: 'lin', name: '林听雪', role: '主角' },
    { id: 'shen', name: '沈砚', role: '剑客' },
    { id: 'yun', name: '云栖', role: '配角' },
    { id: 'mu', name: '木白', role: '反派' },
  ];

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <header className="mb-10">
        <h1 className="font-pixel text-pixel-lg mb-2">PixelKit Showcase</h1>
        <p className="font-ui text-sm text-ink-soft">
          T2.2 验收：基础组件分组展示（按钮 / 输入 / 对话框 / 列表 / 滚动）。
          所有组件遵循 4px 网格、硬边阴影、像素字仅用于 chrome。
        </p>
      </header>

      <Section
        title="Button"
        caption="三种 variant；同屏只允许一个 primary。点击有 2px 像素位移反馈。"
      >
        <div className="flex flex-wrap gap-3 items-center">
          <PixelButton>Primary</PixelButton>
          <PixelButton variant="ghost">Ghost</PixelButton>
          <PixelButton variant="danger">Danger</PixelButton>
          <PixelButton size="sm" variant="ghost">
            Small
          </PixelButton>
          <PixelButton disabled>Disabled</PixelButton>
        </div>
      </Section>

      <Section
        title="Input"
        caption="表单走 Inter，不用像素字。聚焦时描边切到 primary 并加 1 层硬边阴影。"
      >
        <div className="grid gap-4 max-w-md">
          <PixelInput
            placeholder="角色名"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <PixelInput placeholder="禁用态" disabled />
          <PixelTextArea
            placeholder="一句话简介……"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      </Section>

      <Section
        title="Dialog"
        caption="hard-edge shadow Level 3 + 蒙层。Esc 关闭，点击蒙层关闭。"
      >
        <PixelButton onClick={() => setDialogOpen(true)}>打开对话框</PixelButton>
        <PixelDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="确认入库"
          footer={
            <>
              <PixelButton variant="ghost" onClick={() => setDialogOpen(false)}>
                取消
              </PixelButton>
              <PixelButton onClick={() => setDialogOpen(false)}>确认</PixelButton>
            </>
          }
        >
          这一段会作为新设定写入 StoryBible。一旦入库，后续章节的 prompt
          会引用它做一致性约束。
        </PixelDialog>
      </Section>

      <Section
        title="List"
        caption="Bible 实体列表的基础形态：leading dot + 标题 + trailing 副信息。"
      >
        <div className="max-w-sm">
          <PixelList>
            {characters.map((c) => (
              <PixelListItem
                key={c.id}
                active={active === c.id}
                onClick={() => setActive(c.id)}
                leading={
                  <span
                    className="inline-block w-2 h-2 bg-secondary"
                    aria-hidden
                  />
                }
                trailing={<span className="font-pixel text-pixel-sm">{c.role}</span>}
              >
                {c.name}
              </PixelListItem>
            ))}
          </PixelList>
        </div>
      </Section>

      <Section
        title="ScrollArea"
        caption="像素风滚动条：方块、硬边、不模糊。WebKit / Firefox 双适配。"
      >
        <PixelScrollArea
          maxHeight={200}
          className="bg-surface-raised border-2 border-outline rounded-sm p-4"
        >
          <div className="font-prose text-prose space-y-4">
            {Array.from({ length: 12 }, (_, i) => (
              <p key={i}>
                第 {i + 1} 段。
                文字内容只是用来撑出滚动高度。中文长读必须衬线、行高 1.85，
                这是设计系统的硬规则之一。像素字坚决不出现在正文里。
              </p>
            ))}
          </div>
        </PixelScrollArea>
      </Section>
    </div>
  );
}
