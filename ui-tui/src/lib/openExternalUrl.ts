import { spawn, type SpawnOptions } from 'node:child_process'
import { platform } from 'node:os'

/**
 * Opens an external URL in the user's default browser/handler.
 *
 * Wired into the Ink instance via `onHyperlinkClick` in entry.tsx, so any
 * mouse click on a `<Link>` cell (or a row containing a plain-text URL the
 * renderer detected) goes here. Mouse tracking inside the TUI prevents
 * Terminal.app's native Cmd+click from firing — the click is captured
 * before the terminal application sees it — so we have to handle the open
 * ourselves.
 *
 * Safety:
 * - http(s) only. Anything else (`file:`, `data:`, `javascript:`, etc.) is
 *   rejected — a hostile model could otherwise emit `<Link url="file:///">`
 *   and trick a click into running an arbitrary local handler.
 * - Hostname is parsed via `URL`; only well-formed URLs are forwarded.
 * - Spawned via `child_process.spawn` with arg array (no shell), so a URL
 *   containing shell metacharacters (`;`, `&`, backticks) cannot be
 *   interpreted as a command.
 *
 * Returns `true` if the spawn was attempted, `false` if the URL was rejected.
 */
export function openExternalUrl(rawUrl: string, dependencies: OpenDependencies = {}): boolean {
  const url = parseSafeUrl(rawUrl)

  if (!url) {
    return false
  }

  const spawnFn = dependencies.spawn ?? spawn
  const platformId = dependencies.platform?.() ?? platform()

  const command = openCommand(platformId)

  if (!command) {
    return false
  }

  try {
    const child = spawnFn(command.command, [...command.args, url.toString()], {
      // Detach so closing the TUI later doesn't kill the browser process,
      // and ignore stdio so we don't leak FDs into our raw-mode terminal.
      // Without `ignore` here, Chrome's stderr can land in the alt screen.
      detached: true,
      stdio: 'ignore'
    } satisfies SpawnOptions)
    child.unref()

    return true
  } catch {
    // spawn can throw synchronously on unusable PATHs (e.g. WSL without an
    // explorer.exe shim). Treat it as a no-op rather than crashing the TUI.
    return false
  }
}

export type OpenDependencies = {
  spawn?: typeof spawn
  platform?: () => string
}

/**
 * Validate and normalize a URL for opening externally.
 * Exported for testing.
 */
export function parseSafeUrl(value: string): null | URL {
  if (!value || typeof value !== 'string') {
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  // http(s) only — opening file://, data:, javascript:, vbscript:, etc.
  // would let a malicious model run a local handler with attacker-controlled
  // input on a single click.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  // Reject empty or all-whitespace hostnames defensively. URL parsing
  // accepts URLs like 'http:///foo' on some Node versions; we don't want
  // to forward those to `open`.
  if (!parsed.hostname.trim()) {
    return null
  }

  return parsed
}

type OpenCommand = { command: string; args: readonly string[] }

/**
 * Per-platform open command. Matches Sindre Sorhus's `open` package
 * behavior but doesn't pull in another dependency — we only need the
 * straight-line case (default browser, no flags).
 */
export function openCommand(platformId: string): OpenCommand | null {
  if (platformId === 'darwin') {
    return { command: 'open', args: [] }
  }

  if (platformId === 'win32') {
    // `start` is a cmd builtin, not a binary. The leading empty argument
    // is the window title slot — without it, a quoted URL would be parsed
    // as the title rather than the URL on Windows.
    return { command: 'cmd.exe', args: ['/s', '/c', 'start', '""', '/b'] }
  }

  // Linux, BSD, etc.: xdg-open is the standard. WSL ships with it too;
  // explorer.exe is a fallback that some users prefer but requires extra
  // detection — punt on it for now.
  return { command: 'xdg-open', args: [] }
}
