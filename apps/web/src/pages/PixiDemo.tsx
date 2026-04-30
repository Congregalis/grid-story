import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Ticker } from 'pixi.js';

/**
 * T2.1 验收：PixiJS Demo + 缩放策略
 * - 内部 viewport 256x256（"逻辑像素"）
 * - 外部 CSS 放大 2× 配 image-rendering: pixelated → 网格保真
 * - 演示三件事：呼吸缩放、像素粒子、硬边描边
 */
const LOGICAL = 256;
const SCALE = 2;

const PALETTE = {
  bg: 0xfbf3df,
  ink: 0x2a2535,
  primary: 0x5468ff,
  secondary: 0xe85a8e,
  primarySoft: 0xdee2ff,
};

function drawCharacter(g: Graphics) {
  // 24x32 像素小人，硬描边
  g.clear();
  // 阴影（硬边、向右下偏 2px）
  g.rect(-12 + 2, -16 + 2, 24, 32).fill(PALETTE.ink);
  // 身体
  g.rect(-12, -16, 24, 32).fill(PALETTE.primary).stroke({
    width: 2,
    color: PALETTE.ink,
    alignment: 0,
  });
  // 头部高光
  g.rect(-8, -12, 4, 4).fill(PALETTE.primarySoft);
  g.rect(0, -12, 4, 4).fill(PALETTE.primarySoft);
  // 围巾
  g.rect(-12, -2, 24, 4).fill(PALETTE.secondary);
}

function makeParticle(): Graphics {
  const g = new Graphics();
  g.rect(0, 0, 4, 4).fill(PALETTE.secondary);
  return g;
}

export default function PixiDemo() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;

    (async () => {
      const instance = new Application();
      await instance.init({
        width: LOGICAL,
        height: LOGICAL,
        background: PALETTE.bg,
        antialias: false,
        roundPixels: true,
      });
      // StrictMode 下 cleanup 可能在 init 完成之前就跑了 — 这种情况下
      // 用本地 instance destroy（此时 init 已就绪，destroy 安全），
      // 不要让外层 cleanup 去 destroy 一个还没 init 完的 app。
      if (cancelled) {
        instance.destroy(true, { children: true });
        return;
      }
      app = instance;

      instance.canvas.classList.add('pixelated');
      instance.canvas.style.width = `${LOGICAL * SCALE}px`;
      instance.canvas.style.height = `${LOGICAL * SCALE}px`;
      instance.canvas.style.imageRendering = 'pixelated';
      hostRef.current?.appendChild(instance.canvas);

      // 像素背景网格（每 16px 一格）
      const grid = new Graphics();
      for (let x = 0; x <= LOGICAL; x += 16) {
        grid.rect(x, 0, 1, LOGICAL).fill({ color: PALETTE.ink, alpha: 0.05 });
      }
      for (let y = 0; y <= LOGICAL; y += 16) {
        grid.rect(0, y, LOGICAL, 1).fill({ color: PALETTE.ink, alpha: 0.05 });
      }
      instance.stage.addChild(grid);

      // 角色（呼吸动画）
      const charBox = new Container();
      charBox.position.set(LOGICAL / 2, LOGICAL / 2 + 8);
      const char = new Graphics();
      drawCharacter(char);
      charBox.addChild(char);
      instance.stage.addChild(charBox);

      // 像素粒子
      const particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];
      const particleLayer = new Container();
      instance.stage.addChild(particleLayer);

      const spawn = () => {
        const g = makeParticle();
        g.position.set(LOGICAL / 2, LOGICAL / 2);
        particleLayer.addChild(g);
        particles.push({
          g,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5 - 0.5,
          life: 60 + Math.random() * 30,
        });
      };

      let frame = 0;
      const tick = (t: Ticker) => {
        frame += t.deltaTime;
        // 呼吸：sin 波 ±5%
        const s = 1 + Math.sin(frame / 40) * 0.05;
        charBox.scale.set(Math.round(s * 100) / 100);

        // 粒子生成 / 更新
        if (frame % 8 < t.deltaTime) spawn();
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.g.x = Math.round(p.g.x + p.vx);
          p.g.y = Math.round(p.g.y + p.vy);
          p.life -= t.deltaTime;
          p.g.alpha = Math.max(0, p.life / 60);
          if (p.life <= 0) {
            particleLayer.removeChild(p.g);
            p.g.destroy();
            particles.splice(i, 1);
          }
        }
      };
      instance.ticker.add(tick);
    })();

    return () => {
      cancelled = true;
      if (app) {
        // destroy(true) 会移除 canvas + 停 ticker + 释放子 Graphics
        app.destroy(true, { children: true });
        app = null;
      }
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <header className="mb-8">
        <h1 className="font-pixel text-pixel-lg mb-2">PixiJS Demo</h1>
        <p className="font-ui text-sm text-ink-soft max-w-prose">
          T2.1 验收：256×256 逻辑视口 → CSS 放大 2× + image-rendering: pixelated。
          抗锯齿关闭，roundPixels 开启，所有坐标整数化 —— 这是「像素感不糊」的配方。
          下方演示呼吸动画、像素粒子、硬边描边、16px 像素网格。
        </p>
      </header>

      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-2 p-6 inline-block">
        <div ref={hostRef} className="leading-none" />
      </div>

      <section className="mt-10 grid sm:grid-cols-2 gap-6 font-ui text-sm">
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
          <h3 className="font-pixel text-pixel-md mb-2">缩放策略</h3>
          <ul className="list-disc pl-5 text-ink-soft space-y-1">
            <li>逻辑分辨率 = {LOGICAL}px，CSS 缩放 = ×{SCALE}。</li>
            <li>整数倍缩放才能保持像素硬边。</li>
            <li>所有移动量先 Math.round 再赋值，避免亚像素漂移。</li>
          </ul>
        </div>
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
          <h3 className="font-pixel text-pixel-md mb-2">PixiJS 边界</h3>
          <ul className="list-disc pl-5 text-ink-soft space-y-1">
            <li>仅用于：Reader、立绘、转场 / 装饰。</li>
            <li>不接：编辑器、表单、任何 IME 文本（CLAUDE.md §6.1）。</li>
            <li>antialias=false + roundPixels=true 是默认配置。</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
