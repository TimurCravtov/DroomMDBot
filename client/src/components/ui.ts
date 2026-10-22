// Shared class strings so every floating control themes the same way.
// Dark styles apply when <html> has the `dark` class (see hooks/useTheme.ts).

/** Floating card / button background, text and outline. */
export const surface =
  'bg-white text-ink-800 ring-1 ring-ink-200 dark:bg-ink-800 dark:text-ink-100 dark:ring-ink-700';

export const hoverRow = 'hover:bg-ink-50 dark:hover:bg-ink-700';

export const mutedText = 'text-ink-500 dark:text-ink-400';

export const closeButton =
  'rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-ink-200';

/** 40px round map button. */
export const roundButton = `flex h-10 w-10 items-center justify-center rounded-full shadow-lg ${surface} ${hoverRow}`;
