export default function Home() {
  return (
    <div className="max-w-prose mx-auto py-16 px-4">
      <h1 className="font-pixel text-pixel-lg mb-6">grid-story</h1>
      <p className="font-prose text-prose mb-4">
        像素二次元风的人机共创小说工具。本页是开发期入口，列出
        T2.1 / T2.2 验收所需的两个展示场景：
      </p>
      <ul className="font-prose text-prose list-disc pl-5 space-y-2 mb-8">
        <li>
          <a href="/pixi-demo" className="text-primary underline">
            /pixi-demo
          </a>{' '}
          —— PixiJS 像素动画 demo（T2.1：像素美术规范 + Demo 场景）
        </li>
        <li>
          <a href="/showcase" className="text-primary underline">
            /showcase
          </a>{' '}
          —— PixelKit 组件展示（T2.2：基础组件 storybook 化）
        </li>
      </ul>
      <p className="font-ui text-sm text-ink-soft">
        视觉规范见 <code className="font-mono">apps/web/DESIGN.md</code>，
        模块拆解见根目录 <code className="font-mono">DESIGN.md</code>。
      </p>
    </div>
  );
}
