import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { BackendStatus } from './components/BackendStatus';
import { Toaster } from './components/Toaster';
import { api } from './lib/api';
import { useBookId } from './lib/book';
import StagePage from './features/stages/StagePage';
import StageRedirect from './features/stages/StageRedirect';
import Bookshelf from './pages/Bookshelf';
import BibleStudio from './pages/BibleStudio';
import BookSettings from './pages/BookSettings';
import OutlineCanvas from './pages/OutlineCanvas';
import WikiBrowser from './pages/WikiBrowser';
import WritingDesk from './pages/WritingDesk';

const SHOW_DEV_TOOLS = import.meta.env.DEV;
const DEV_PAGES = SHOW_DEV_TOOLS
  ? {
      Showcase: lazy(() => import('./pages/Showcase')),
      PixiDemo: lazy(() => import('./pages/PixiDemo')),
    }
  : null;

function readStoredBookId(): string | null {
  return localStorage.getItem('grid-story:bookId');
}

function BookTitleLabel({ bookId }: { bookId: string }) {
  const { data } = useQuery<{ title: string }>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<{ title: string }>(`/book/${encodeURIComponent(bookId)}`),
    staleTime: 60_000,
  });
  return (
    <Link
      to={`/books/${bookId}`}
      className="font-pixel text-pixel-md text-ink hover:text-primary truncate max-w-[200px]"
    >
      {data?.title ?? '...'}
    </Link>
  );
}

function NavBar() {
  const location = useLocation();
  const bookMatch = location.pathname.match(/^\/books\/([^/]+)/);
  const bookId = bookMatch ? bookMatch[1] : null;
  const [storedBookId, setBookId] = useBookId();

  // Sync URL param → localStorage so existing pages that use useBookId() keep working.
  useEffect(() => {
    if (bookId && bookId !== storedBookId) {
      setBookId(bookId);
    }
  }, [bookId, storedBookId, setBookId]);

  // Stages 路径下 StageShell 自带 header，隐藏全局 NavBar 避免重复
  const isStagePage = /^\/books\/[^/]+\/stages\//.test(location.pathname);
  if (isStagePage) return null;

  const linkBase = 'font-pixel text-pixel-md px-3 py-1 border-2 border-outline rounded-sm';
  const active = 'bg-primary text-on-primary shadow-pixel-1';
  const idle = 'bg-surface text-ink hover:bg-surface-raised';
  const cls = ({ isActive }: { isActive: boolean }) => `${linkBase} ${isActive ? active : idle}`;

  if (bookId) {
    // expert 模式专用 NavBar：链接指向 expert/* 避免被 LegacyExpertRedirect 二次跳转
    return (
      <nav className="border-b-2 border-outline bg-surface px-6 py-3 flex items-center gap-3">
        <Link to={`/books/${bookId}`} className="font-pixel text-pixel-md text-ink-mute hover:text-ink">
          ← 引导流程
        </Link>
        <span className="text-ink-mute">/</span>
        <BookTitleLabel bookId={bookId} />
        <span className="ml-2 font-pixel text-pixel-sm text-warning">专家模式</span>
        <span className="w-2" />
        <NavLink to={`/books/${bookId}/expert/bible`} className={cls}>
          设定
        </NavLink>
        <NavLink to={`/books/${bookId}/expert/outline`} className={cls}>
          大纲
        </NavLink>
        <NavLink to={`/books/${bookId}/expert/writing`} className={cls}>
          写作
        </NavLink>
        <NavLink to={`/books/${bookId}/expert/wiki`} className={cls}>
          Wiki
        </NavLink>
        <NavLink to={`/books/${bookId}/expert/settings`} className={cls}>
          作品
        </NavLink>
        {SHOW_DEV_TOOLS && (
          <>
            <NavLink to="/showcase" className={cls}>
              组件
            </NavLink>
            <NavLink to="/pixi-demo" className={cls}>
              Pixi
            </NavLink>
          </>
        )}
        <span className="ml-auto flex items-center gap-3">
          <BackendStatus />
        </span>
      </nav>
    );
  }

  return (
    <nav className="border-b-2 border-outline bg-surface px-6 py-3 flex items-center gap-3">
      <Link to="/books" className="font-pixel text-pixel-md">
        grid-story
      </Link>
      {SHOW_DEV_TOOLS && (
        <>
          <NavLink to="/showcase" className={cls}>
            组件
          </NavLink>
          <NavLink to="/pixi-demo" className={cls}>
            Pixi
          </NavLink>
        </>
      )}
      <span className="ml-auto flex items-center gap-3">
        <BackendStatus />
      </span>
    </nav>
  );
}

function LegacyRedirect({ to }: { to: (bookId: string) => string }) {
  const stored = readStoredBookId();
  if (!stored) return <Navigate to="/books" replace />;
  return <Navigate to={to(stored)} replace />;
}

/** /books/:bookId/<old> → /books/:bookId/expert/<path>，保留旧书签 */
function LegacyExpertRedirect({ path }: { path: string }) {
  const location = useLocation();
  const match = location.pathname.match(/^\/books\/([^/]+)\//);
  const bookId = match?.[1];
  if (!bookId) return <Navigate to="/books" replace />;
  return <Navigate to={`/books/${bookId}/expert/${path}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg text-ink">
        <NavBar />
        <Routes>
          {/* New stage-driven routes */}
          <Route path="/books" element={<Bookshelf />} />
          <Route path="/books/:bookId" element={<StageRedirect />} />
          <Route path="/books/:bookId/stages/:stage" element={<StagePage />} />

          {/* Expert mode：老页面作为高级入口保留 */}
          <Route path="/books/:bookId/expert/bible" element={<BibleStudio />} />
          <Route path="/books/:bookId/expert/writing" element={<WritingDesk />} />
          <Route path="/books/:bookId/expert/outline" element={<OutlineCanvas />} />
          <Route path="/books/:bookId/expert/wiki" element={<WikiBrowser />} />
          <Route path="/books/:bookId/expert/settings" element={<BookSettings />} />

          {/* Old-URL → expert/ redirects（老书签兼容） */}
          <Route
            path="/books/:bookId/bible"
            element={<LegacyExpertRedirect path="bible" />}
          />
          <Route
            path="/books/:bookId/writing"
            element={<LegacyExpertRedirect path="writing" />}
          />
          <Route
            path="/books/:bookId/outline"
            element={<LegacyExpertRedirect path="outline" />}
          />
          <Route
            path="/books/:bookId/wiki"
            element={<LegacyExpertRedirect path="wiki" />}
          />
          <Route
            path="/books/:bookId/settings"
            element={<LegacyExpertRedirect path="settings" />}
          />

          {/* Dev-only routes */}
          {SHOW_DEV_TOOLS && DEV_PAGES && (
            <>
              <Route
                path="/showcase"
                element={
                  <Suspense fallback={null}>
                    <DEV_PAGES.Showcase />
                  </Suspense>
                }
              />
              <Route
                path="/pixi-demo"
                element={
                  <Suspense fallback={null}>
                    <DEV_PAGES.PixiDemo />
                  </Suspense>
                }
              />
            </>
          )}

          {/* Legacy redirects */}
          <Route
            path="/"
            element={
              <LegacyRedirect to={(id) => `/books/${id}`} />
            }
          />
          <Route
            path="/bible"
            element={
              <LegacyRedirect to={(id) => `/books/${id}/bible`} />
            }
          />
          <Route
            path="/writing"
            element={
              <LegacyRedirect to={(id) => `/books/${id}/writing`} />
            }
          />
          <Route
            path="/outline"
            element={
              <LegacyRedirect to={(id) => `/books/${id}/outline`} />
            }
          />
          <Route
            path="/settings"
            element={
              <LegacyRedirect to={(id) => `/books/${id}/settings`} />
            }
          />
        </Routes>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}
