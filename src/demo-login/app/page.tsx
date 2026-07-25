'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PERSONAS } from '../data/personas';

const SESSION_KEY = 'sanctiondesk-demo-persona';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const persona = PERSONAS.find((p) => p.username === username.trim() && p.password === password);
    if (!persona) {
      setError('Unknown username or password.');
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(persona));
    router.push('/dashboard');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%', maxWidth: '360px', background: '#161a22', borderRadius: '16px', padding: '28px',
          border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>SanctionDesk</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '22px' }}>
          Manager login for this walkthrough -- clients don't need to log in at all.
        </div>

        <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          style={inputStyle}
        />

        <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {error && (
          <div style={{ fontSize: '13px', color: '#fca5a5', marginBottom: '12px' }}>{error}</div>
        )}

        <button type="submit" style={buttonStyle}>Log in</button>

        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '16px', lineHeight: 1.5 }}>
          Demo-only, hardcoded credentials -- not a real login system. See
          src/demo-login/data/personas.example.ts to configure who's who.
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: '14px', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.15)', background: '#0f1218', color: '#e5e7eb',
  marginTop: '6px', marginBottom: '16px',
};

const buttonStyle: React.CSSProperties = {
  width: '100%', fontSize: '14px', fontWeight: 600, padding: '10px 12px', borderRadius: '8px',
  border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', marginBottom: '4px',
};
