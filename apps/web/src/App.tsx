import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Showcase from './pages/Showcase';
import PixiDemo from './pages/PixiDemo';
import BibleStudio from './pages/BibleStudio';
import WritingDesk from './pages/WritingDesk';
import OutlineCanvas from './pages/OutlineCanvas';
import { BookSwitcher } from './components/BookSwitcher';

function NavBar() {
  const linkBase =
    'font-pixel text-pixel-md px-3 py-1 border-2 border-outline rounded-sm';
  const active = 'bg-primary text-on-primary shadow-pixel-1';
  const idle = 'bg-surface text-ink hover:bg-surface-raised';
  const cls = ({ isActive }: { isActive: boolean }) =>
    `${linkBase} ${isActive ? active : idle}`;
  return (
    <nav className="border-b-2 border-outline bg-surface px-6 py-3 flex items-center gap-3">
      <span className="font-pixel text-pixel-md mr-4">grid-story</span>
      <NavLink to="/" end className={cls}>
        Home
      </NavLink>
      <NavLink to="/bible" className={cls}>
        Bible
      </NavLink>
      <NavLink to="/writing" className={cls}>
        Writing
      </NavLink>
      <NavLink to="/outline" className={cls}>
        Outline
      </NavLink>
      <NavLink to="/showcase" className={cls}>
        Showcase
      </NavLink>
      <NavLink to="/pixi-demo" className={cls}>
        PixiDemo
      </NavLink>
      <span className="ml-auto">
        <BookSwitcher />
      </span>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg text-ink">
        <NavBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bible" element={<BibleStudio />} />
          <Route path="/writing" element={<WritingDesk />} />
          <Route path="/outline" element={<OutlineCanvas />} />
          <Route path="/showcase" element={<Showcase />} />
          <Route path="/pixi-demo" element={<PixiDemo />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
