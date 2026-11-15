'use client';

import { useState } from 'react';

/** The MCP address, big, with a button that copies it. */
export function McpUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="mcp-box">
      <code>{url}</code>
      <button type="button" className="pix small" onClick={copy} aria-live="polite">{copied ? 'COPIED' : 'COPY'}</button>
    </div>
  );
}
