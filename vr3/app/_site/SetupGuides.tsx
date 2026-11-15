'use client';

import { useRef, useState } from 'react';

/**
 * "Set it up in Muse · Claude · ChatGPT" under the MCP's tools, and a pop-up with the steps for each (2026-11-15: "add a
 * link to how to setup with Muse, Claude, ChatGPT, and a pop up to explain how to add a custom connector in each").
 *
 * The steps are each company's own, as of 2026-11-15:
 *   Muse     Meta's help page: you ask Muse in a chat to make a custom connector, and it walks you through it
 *   Claude   claude.com/docs/connectors/custom/remote-mcp: Customize › Connectors › Add › Add custom connector
 *   ChatGPT  developers.openai.com/plugins/deploy/connect-chatgpt: Plugins › + › Add custom MCP server (Business,
 *            Enterprise and Edu on the web, per OpenAI's help centre)
 * Our server needs no sign-in (lib/guide.ts), so each has the shortest version. Check these when a pop-up looks wrong:
 * the menus move.
 */
type Agent = 'muse' | 'claude' | 'chatgpt';
const ASK = 'Make me an Inbox Zero game with my unread email.';

export function SetupGuides({ url }: { url: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [agent, setAgent] = useState<Agent>('muse');
  const [copied, setCopied] = useState('');
  const open = (which: Agent) => { setAgent(which); dialog.current?.showModal(); };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(text); window.setTimeout(() => setCopied(c => (c === text ? '' : c)), 1600);
  };
  const Copy = ({ text }: { text: string }) => (
    <span className="setup-copy">
      <code>{text}</code>
      <button type="button" onClick={() => copy(text)}>{copied === text ? 'Copied' : 'Copy'}</button>
    </span>
  );

  const AGENTS: Record<Agent, { name: string; steps: React.ReactNode[]; note: React.ReactNode; help: string; helpName: string }> = {
    muse: {
      name: 'Muse',
      steps: [
        <>Open a new chat in Muse.</>,
        <>Send it this, and Muse will add the connector:<Copy text={`Add a custom connector called Inbox Zero VR with this MCP server: ${url}`} /></>,
        <>Approve it when Muse asks. There’s nothing to sign in to.</>,
        <>Then ask:<Copy text={ASK} /></>,
      ],
      note: <>Meta doesn’t review custom connectors, so Muse asks you to approve it first.</>,
      help: 'https://www.meta.com/help/artificial-intelligence/1687253048996149/', helpName: 'How Muse works with Connectors',
    },
    claude: {
      name: 'Claude',
      steps: [
        <>Go to <a href="https://claude.ai/customize/connectors" target="_blank" rel="noopener noreferrer">Customize › Connectors</a>.</>,
        <>Select <b>Add</b>, then <b>Add custom connector</b>.</>,
        <>Name it Inbox Zero VR, paste the URL and click <b>Continue</b>:<Copy text={url} /></>,
        <>If it asks how people sign in, choose <b>No sign-in</b>. Click <b>Add</b>.</>,
        <>In a new chat, ask:<Copy text={ASK} /></>,
      ],
      note: <>Works on every plan; the Free plan allows one custom connector. On Team and Enterprise, an Owner adds it under Organization settings › Connectors, then you click <b>Connect</b>.</>,
      help: 'https://claude.com/docs/connectors/custom/remote-mcp', helpName: 'Claude’s guide to custom connectors',
    },
    chatgpt: {
      name: 'ChatGPT',
      steps: [
        <>On the web, go to <a href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">Plugins</a>.</>,
        <>Select <b>+</b>, then <b>Add custom MCP server</b>.</>,
        <>Name it Inbox Zero VR and paste the URL:<Copy text={url} /></>,
        <>Set authentication to none, select <b>I understand and want to continue</b>, then <b>Create as a plugin</b>.</>,
        <>In a new chat, ask:<Copy text={ASK} /></>,
      ],
      note: <>OpenAI offers custom MCP servers on Business, Enterprise and Edu, on ChatGPT for the web. In a workspace, an admin may need to allow them first.</>,
      help: 'https://developers.openai.com/plugins/deploy/connect-chatgpt', helpName: 'OpenAI’s guide to custom MCP servers',
    },
  };
  const now = AGENTS[agent];

  return (
    <>
      <div className="setup-links">
        <span>Set it up in</span>
        {(Object.keys(AGENTS) as Agent[]).map(id => (
          <button key={id} type="button" className="pix small" onClick={() => open(id)}>{AGENTS[id].name.toUpperCase()}</button>
        ))}
      </div>

      <dialog ref={dialog} className="setup" aria-label="Add Inbox Zero VR to your agent" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
        <div className="setup-box">
          <div className="setup-head">
            <h3>Add Inbox Zero VR to your agent</h3>
            <button type="button" className="setup-x" aria-label="Close" onClick={() => dialog.current?.close()}>✕</button>
          </div>
          <div className="setup-tabs" role="tablist">
            {(Object.keys(AGENTS) as Agent[]).map(id => (
              <button key={id} type="button" role="tab" aria-selected={id === agent} onClick={() => setAgent(id)}>{AGENTS[id].name}</button>
            ))}
          </div>
          <p className="setup-first">Your agent also needs your email connected (Gmail, Outlook and so on), so it can read your unread mail.</p>
          <ol className="setup-steps">
            {now.steps.map((step, i) => <li key={`${agent}-${i}`}>{step}</li>)}
          </ol>
          <p className="setup-note">{now.note}</p>
          <a className="setup-help" href={now.help} target="_blank" rel="noopener noreferrer">{now.helpName} ↗</a>
        </div>
      </dialog>
    </>
  );
}
