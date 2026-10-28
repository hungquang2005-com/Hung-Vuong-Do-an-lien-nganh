import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'sáng' : 'tối';
  return <button type="button" className={`theme-toggle ${className}`} onClick={toggleTheme} aria-label={`Chuyển sang giao diện ${next}`} title={`Giao diện ${next}`}>
    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
  </button>;
}
