import { StageShell } from './StageShell';
import { CharterStage } from './pages/CharterStage';
import { OutlineStage } from './pages/OutlineStage';
import { PublishStage } from './pages/PublishStage';
import { SetupStage } from './pages/SetupStage';
import { StagePlaceholder } from './pages/StagePlaceholder';
import { WritingStage } from './pages/WritingStage';

/** 路由 `/books/:bookId/stages/:stage` 的入口组件。 */
export default function StagePage() {
  return (
    <StageShell>
      {({ ctx, bookId, stageId }) => {
        switch (stageId) {
          case 'charter':
            return <CharterStage ctx={ctx} bookId={bookId} />;
          case 'setup':
            return <SetupStage ctx={ctx} bookId={bookId} />;
          case 'outline':
            return <OutlineStage ctx={ctx} bookId={bookId} />;
          case 'writing':
            return <WritingStage ctx={ctx} bookId={bookId} />;
          case 'publish':
            return <PublishStage ctx={ctx} bookId={bookId} />;
          default:
            return <StagePlaceholder ctx={ctx} bookId={bookId} stageId={stageId} />;
        }
      }}
    </StageShell>
  );
}
