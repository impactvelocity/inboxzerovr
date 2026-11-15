import { KEYPAD_SHADOW, pixelLabel, pixelSentence } from './home';
import { uiSound } from './uisound';

/**
 * MCP, top right beside the hackathon badge (2026-11-15: "add a MCP button next to the meta icon / make this a pop up with the mcp url
 * and a copy link and brief desription / like give this url to your agent to create a round with your email / and small text saying -
 * nothing is kept, your data is private and deleted after every round").
 *
 * The URL is this page's own origin + /mcp (the site's MCP server, app/mcp; the game's dev server passes /mcp through to it).
 */
export function bindMcpCard() {
  const open = document.getElementById('open-mcp') as HTMLButtonElement | null, dialog = document.getElementById('mcp') as HTMLDialogElement | null;
  if (!open || !dialog) return;
  const url = document.getElementById('mcp-url') as HTMLInputElement, copy = document.getElementById('mcp-copy') as HTMLButtonElement, title = document.getElementById('mcp-title')!;
  const lede = document.getElementById('mcp-lede')!, small = document.getElementById('mcp-private')!;
  const address = `${location.origin}/mcp`;
  url.value = address;
  let reset: ReturnType<typeof setTimeout> | null = null;
  const label = (words: string) => { pixelLabel(copy, words, 2, '#14121a'); copy.setAttribute('aria-label', words); };

  open.addEventListener('click', () => {
    uiSound('confirm');
    // (drawn on each open: the title and "AI agent" take the chosen level's colour)
    const accent = getComputedStyle(title).color;
    pixelLabel(title, 'Connect Your Agent', 3, accent, KEYPAD_SHADOW);
    pixelSentence(lede, [{ text: 'Give this URL to your ', strong: false }, { text: 'AI agent', strong: true }, { text: ' to create a round with your email', strong: false }], 2, '#ffffff', accent);
    pixelSentence(small, [{ text: 'Nothing is kept, your data is private and deleted after every round', strong: false }], 1.5, '#ffffff', accent);
    if (reset) { clearTimeout(reset); reset = null; } label('Copy Link');
    dialog.showModal();
    copy.focus();
  });
  url.addEventListener('focus', () => url.select());
  copy.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(address); ok = true; } catch {
      // (no clipboard here: select it and copy the old way)
      url.focus(); url.select(); try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    uiSound(ok ? 'confirm' : 'back');
    label(ok ? 'Copied' : 'Select and Copy');
    if (reset) clearTimeout(reset);
    reset = setTimeout(() => { reset = null; label('Copy Link'); }, 2000);
  });
  document.getElementById('mcp-close')!.addEventListener('click', () => { uiSound('back'); dialog.close(); });
  // (a click on the dimmed page round the card closes it)
  dialog.addEventListener('click', e => {
    const box = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)) dialog.close();
  });
}
