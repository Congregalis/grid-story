import { StageShell } from './StageShell';
import { StagePlaceholder } from './pages/StagePlaceholder';

/** 路由 `/books/:bookId/stages/:stage` 的入口组件。 */
export default function StagePage() {
  return (
    <StageShell>
      {({ ctx, bookId, stageId }) => (
        <StagePlaceholder ctx={ctx} bookId={bookId} stageId={stageId} />
      )}
    </StageShell>
  );
}
