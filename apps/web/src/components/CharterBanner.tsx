import { Link } from 'react-router-dom';

const STORAGE_KEY = 'grid-story:charter-banner-dismissed';

interface CharterBannerProps {
  bookId: string;
  filled: number;
  total: number;
}

export function CharterBanner({ bookId, filled, total }: CharterBannerProps) {
  const pct = Math.round((filled / total) * 100);
  if (pct >= 50) return null;

  const dismissed = localStorage.getItem(STORAGE_KEY);
  if (dismissed === bookId) return null;

  return (
    <div className="bg-warning/15 border-2 border-warning rounded-md px-4 py-2 flex items-center gap-3 font-ui text-sm">
      <span className="font-pixel text-pixel-sm text-warning">
        创作设定完成度 {pct}%
      </span>
      <span className="text-ink-soft">
        设定越完整，AI 写作越不容易跑偏。
      </span>
      <Link
        to={`/books/${bookId}/settings`}
        className="text-primary hover:underline ml-auto"
      >
        去完善
      </Link>
      <button
        type="button"
        className="text-ink-mute hover:text-ink text-pixel-sm"
        onClick={() => localStorage.setItem(STORAGE_KEY, bookId)}
        aria-label="关闭提醒"
      >
        ✕
      </button>
    </div>
  );
}

/** Clear dismissal so the banner shows again — call after updating charter. */
export function resetCharterBanner(bookId: string) {
  const dismissed = localStorage.getItem(STORAGE_KEY);
  if (dismissed === bookId) {
    localStorage.removeItem(STORAGE_KEY);
  }
}
