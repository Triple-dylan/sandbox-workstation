/**
 * Light or dark. When the page is shown inside a viewer that sets its own theme (the Claude app
 * puts `data-theme` on the root), that wins; otherwise the system setting does. An explicit choice
 * in the account menu overrides both until it is set back to "system".
 */
const root = document.documentElement;
const fromHost = root.getAttribute('data-theme');
let wrote = false;

export type ThemeChoice = 'system' | 'light' | 'dark';

export function applyTheme(choice: ThemeChoice) {
  if (choice === 'system') {
    if (!wrote) return;
    wrote = false;
    if (fromHost) root.setAttribute('data-theme', fromHost);
    else root.removeAttribute('data-theme');
    return;
  }
  wrote = true;
  root.setAttribute('data-theme', choice);
}

export function isDark() {
  const set = root.getAttribute('data-theme');
  return set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
