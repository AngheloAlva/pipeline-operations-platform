"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_e) {
    // localStorage unavailable — silently skip persistence
  }
}

export function ThemeToggle() {
  // SSR: document is undefined → start with "light" to match server render.
  // Client: useEffect syncs state from the actual DOM class (set by the inline
  // script) so the icon is correct after hydration without a mismatch warning.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial: Theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      suppressHydrationWarning
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors"
    >
      {isDark ? (
        // Sun icon
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Moon icon
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
