/**
 * Shell chrome preferences: whether the navigation rail is collapsed.
 *
 * Session-scoped on purpose. CPAMC opens as a fixed app window on the
 * secondary display, where the label rail steals horizontal room the quota
 * cards can use, so a fresh app window starts collapsed. The operator can
 * still expand it for the life of that window (header chevron or Ctrl+B) and
 * the choice is remembered until the window closes — a new launch collapses
 * again instead of inheriting the last session's rail.
 */

export type ShellUiState = {
  sidebarCollapsed?: boolean;
};

const SHELL_UI_STATE_KEY = 'shell.uiState';

export const readShellUiState = (): ShellUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SHELL_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShellUiState;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      sidebarCollapsed:
        typeof parsed.sidebarCollapsed === 'boolean' ? parsed.sidebarCollapsed : undefined,
    };
  } catch {
    return null;
  }
};

export const writeShellUiState = (state: ShellUiState) => {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...readShellUiState(), ...state };
    window.sessionStorage.setItem(SHELL_UI_STATE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; the collapse still works for this render tree.
  }
};

/** App-window default: collapsed until the operator says otherwise. */
export const readSidebarCollapsedDefault = (): boolean =>
  readShellUiState()?.sidebarCollapsed ?? true;
