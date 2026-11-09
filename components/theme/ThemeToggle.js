"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ initialTheme = 'dark' }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState(initialTheme);
  const presentation = /^\/(room|stage|qr|poster)\//.test(pathname || '') || /^\/vote\/[^/]+\/stage\/?$/.test(pathname || '');
  if (presentation) return null;
  function change() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `spill_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setTheme(next);
  }
  return <button type="button" className="theme-toggle" onClick={change} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-pressed={theme === 'light'} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
    {theme === 'dark' ? <Sun size={16} aria-hidden="true"/> : <Moon size={16} aria-hidden="true"/>}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
  </button>;
}
