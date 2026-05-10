import { Navigate, useParams } from 'react-router-dom';
import { inferActiveStage } from './navigator';
import { useStageContext } from './useStageContext';

/** 路由 `/books/:bookId` 的入口：根据完成度自动跳到 active stage。 */
export default function StageRedirect() {
  const { bookId } = useParams<{ bookId: string }>();
  if (!bookId) return <Navigate to="/books" replace />;
  return <RedirectInner bookId={bookId} />;
}

function RedirectInner({ bookId }: { bookId: string }) {
  const { ctx, loading, error } = useStageContext(bookId);
  if (loading || !ctx) {
    return (
      <div className="p-6 font-ui text-sm text-ink-soft">
        {error ? '加载失败，请稍后重试' : '加载中…'}
      </div>
    );
  }
  const active = inferActiveStage(ctx);
  return <Navigate to={`/books/${bookId}/stages/${active}`} replace />;
}
