import { StageShell } from './StageShell';
import { CharterStage } from './pages/CharterStage';
import { SetupStage } from './pages/SetupStage';
import { StagePlaceholder } from './pages/StagePlaceholder';

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
          default:
            return <StagePlaceholder ctx={ctx} bookId={bookId} stageId={stageId} />;
        }
      }}
    </StageShell>
  );
}
