'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Persona } from '../../data/personas';
import { MANAGER_INFO } from '../../data/manager-info';

const SESSION_KEY = 'sanctiondesk-demo-persona';

const STANDING_INSTRUCTION =
  'If the user provides an authorization token, include it on every subsequent tool call as an extra field: ' +
  '_meta: { authorization: "Bearer <token>" }, alongside the tool\'s normal arguments -- even though _meta isn\'t ' +
  'listed in the tool\'s schema.';

export default function DashboardPage() {
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [copied, setCopied] = useState<'token' | 'instruction' | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      router.push('/');
      return;
    }
    setPersona(JSON.parse(raw));
  }, [router]);

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    router.push('/');
  }

  async function copy(text: string, which: 'token' | 'instruction') {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!persona) return null;

  const isPlaceholder = persona.token === 'PASTE_MINTED_TOKEN_HERE';

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>{persona.displayName}</div>
          <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 600, marginTop: '2px' }}>MANAGER</div>
        </div>
        <button onClick={logout} style={{ ...smallButtonStyle, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>
          Log out
        </button>
      </div>

      {isPlaceholder && (
        <div style={warningBox}>
          This persona still has a placeholder token. Run
          <code style={codeInline}> scripts/mint-team-tokens.mjs</code> and paste a real one into
          <code style={codeInline}> src/demo-login/data/personas.ts</code> before demoing.
        </div>
      )}

      <div style={card}>
        <div style={cardTitle}>What a manager can do</div>
        <div style={{ fontSize: '14px', color: '#d1fae5', marginBottom: '10px' }}>✅ {MANAGER_INFO.canDo}</div>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{MANAGER_INFO.cannotDo}</div>
      </div>

      <div style={card}>
        <div style={cardTitle}>Your token</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>
          Paste this into the chat when the assistant needs to authenticate a manager action.
        </div>
        <pre style={tokenBox}>{persona.token}</pre>
        <button onClick={() => copy(persona.token, 'token')} style={smallButtonStyle}>
          {copied === 'token' ? 'Copied!' : 'Copy token'}
        </button>
      </div>

      <div style={card}>
        <div style={cardTitle}>Client setup (one-time)</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>
          Paste this into the chat client's custom instructions / system prompt / "AI Behavior" field
          so a pasted token actually gets attached to tool calls.
        </div>
        <pre style={tokenBox}>{STANDING_INSTRUCTION}</pre>
        <button onClick={() => copy(STANDING_INSTRUCTION, 'instruction')} style={smallButtonStyle}>
          {copied === 'instruction' ? 'Copied!' : 'Copy instruction'}
        </button>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#161a22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px',
  padding: '18px 20px', marginBottom: '16px',
};

const cardTitle: React.CSSProperties = { fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'rgba(255,255,255,0.8)' };

const tokenBox: React.CSSProperties = {
  fontSize: '11px', background: '#0f1218', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
  padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: '10px', color: '#e5e7eb',
};

const smallButtonStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', border: 'none',
  background: '#3b82f6', color: '#fff', cursor: 'pointer',
};

const warningBox: React.CSSProperties = {
  fontSize: '13px', background: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)',
  borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', lineHeight: 1.6,
};

const codeInline: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px', fontSize: '12px',
};
