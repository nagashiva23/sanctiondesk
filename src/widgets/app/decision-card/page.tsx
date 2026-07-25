'use client';

import { useState } from 'react';
import { useTheme, useWidgetState, useWidgetSDK } from '@nitrostack/widgets';

interface GateResult {
  gate: string;
  status: 'PASS' | 'MANUAL' | 'REJECT';
  actual: number | string;
  threshold: number | string;
  unit: string;
  policyRef: string;
}

interface DecisionCardData {
  caseId: string;
  policyVersion: string;
  policyVersionHash: string;
  decision: 'APPROVE' | 'APPROVE_WITH_REDUCTION' | 'MANUAL_REVIEW' | 'REJECT';
  bindingConstraint: string | null;
  hardReject: boolean;
  gates: GateResult[];
  narrative: string;
  score: {
    sanctionedAmount: number;
    emi: number;
    resolvedRate: number;
  };
  ledgerRef: string;
}

interface VerifyAuditChainResult {
  valid: boolean;
  breachIndex: number | null;
  reason: string | null;
  blockCount: number;
  merkleRoot: string | null;
}

interface SubmitHumanOverrideResult {
  recorded: boolean;
  finalDecision: 'APPROVE' | 'REJECT';
}

const DECISION_STYLE: Record<DecisionCardData['decision'], { color: string; label: string; icon: string }> = {
  APPROVE: { color: '#10b981', label: 'Approved', icon: '✅' },
  APPROVE_WITH_REDUCTION: { color: '#3b82f6', label: 'Approved (Reduced)', icon: '🔽' },
  MANUAL_REVIEW: { color: '#f59e0b', label: 'Manual Review', icon: '👤' },
  REJECT: { color: '#ef4444', label: 'Rejected', icon: '⛔' },
};

const GATE_COLOR: Record<GateResult['status'], string> = {
  PASS: '#10b981',
  MANUAL: '#f59e0b',
  REJECT: '#ef4444',
};

/** Parses a callTool response's `result` text as JSON; throws with the raw text as the message on failure (denied/errored calls return plain text, not JSON). */
function parseToolResult<T>(result: { result: string; isError?: boolean }): T {
  if (result.isError) throw new Error(result.result);
  try {
    return JSON.parse(result.result) as T;
  } catch {
    throw new Error(result.result);
  }
}

function SectionButton({
  onClick, disabled, isDark, textColor, children,
}: { onClick: () => void; disabled?: boolean; isDark: boolean; textColor: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: '12px', padding: '6px 10px', borderRadius: '8px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
        background: 'transparent', color: textColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function VerifyChainSection({
  caseId, isDark, textColor, mutedColor, cardBg,
}: { caseId: string; isDark: boolean; textColor: string; mutedColor: string; cardBg: string }) {
  const { callTool } = useWidgetSDK();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyAuditChainResult | null>(null);

  async function handleVerify() {
    setLoading(true);
    setError(null);
    try {
      const result = await callTool('verify_audit_chain', { caseId, seal: false });
      setReport(parseToolResult<VerifyAuditChainResult>(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: '14px' }}>
      <SectionButton onClick={handleVerify} disabled={loading} isDark={isDark} textColor={textColor}>
        {loading ? 'Verifying…' : 'Verify audit chain'}
      </SectionButton>

      {error && (
        <div style={{ marginTop: '8px', fontSize: '12px', padding: '10px 12px', borderRadius: '8px', background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', color: isDark ? '#fca5a5' : '#b91c1c' }}>
          {error}
        </div>
      )}

      {report && !error && (
        <div style={{ marginTop: '8px', fontSize: '12px', padding: '10px 12px', borderRadius: '8px', background: cardBg }}>
          {report.valid ? (
            <div style={{ color: '#10b981', fontWeight: 700 }}>✅ Chain valid -- {report.blockCount} block{report.blockCount === 1 ? '' : 's'}</div>
          ) : (
            <div style={{ color: '#ef4444', fontWeight: 700 }}>❌ Tampered at block {report.breachIndex} ({report.reason})</div>
          )}
          {report.valid && report.merkleRoot && (
            <div style={{ color: mutedColor, marginTop: '4px' }}>Merkle root: {report.merkleRoot.slice(0, 16)}…</div>
          )}
        </div>
      )}
    </div>
  );
}

function ManualReviewPanel({
  caseId, isDark, textColor, mutedColor, cardBg,
}: { caseId: string; isDark: boolean; textColor: string; mutedColor: string; cardBg: string }) {
  const { callTool } = useWidgetSDK();
  const [officerId, setOfficerId] = useState('');
  const [justification, setJustification] = useState('');
  const [showTokenField, setShowTokenField] = useState(false);
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<SubmitHumanOverrideResult | null>(null);

  const canSubmit = officerId.trim().length > 0 && justification.trim().length >= 10 && !submitting;

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '8px 10px', borderRadius: '8px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
    background: isDark ? '#1a1a1a' : '#ffffff', color: textColor, marginBottom: '8px',
  };

  async function submit(decision: 'APPROVE' | 'REJECT') {
    setSubmitting(true);
    setError(null);
    try {
      const result = await callTool('submit_human_override', {
        caseId,
        officerId: officerId.trim(),
        decision,
        justification: justification.trim(),
        ...(token.trim() ? { _meta: { authorization: `Bearer ${token.trim()}` } } : {}),
      });
      setRecorded(parseToolResult<SubmitHumanOverrideResult>(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (recorded) {
    const style = DECISION_STYLE[recorded.finalDecision];
    return (
      <div style={{ background: cardBg, borderRadius: '12px', padding: '14px', marginBottom: '14px', fontSize: '13px' }}>
        <span style={{ color: style.color, fontWeight: 700 }}>{style.icon} Recorded: {recorded.finalDecision} by {officerId.trim()}</span>
      </div>
    );
  }

  return (
    <div style={{ background: cardBg, borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
      <div style={{ fontSize: '13px', color: mutedColor, marginBottom: '10px' }}>
        No amount has been sanctioned yet. A credit officer must approve or reject this case.
      </div>

      <input
        placeholder="Officer ID"
        value={officerId}
        onChange={(e) => setOfficerId(e.target.value)}
        style={inputStyle}
      />
      <textarea
        placeholder="Justification (min. 10 characters)"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />

      <button
        onClick={() => setShowTokenField((v) => !v)}
        style={{ fontSize: '11px', background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: 0, marginBottom: '8px', textDecoration: 'underline' }}
      >
        {showTokenField ? 'Hide' : 'Advanced: paste officer token'}
      </button>
      {showTokenField && (
        <input
          placeholder="Officer authorization token (only needed if the server requires it)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={inputStyle}
        />
      )}

      {error && (
        <div style={{ fontSize: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', color: isDark ? '#fca5a5' : '#b91c1c' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => submit('APPROVE')}
          disabled={!canSubmit}
          style={{
            flex: 1, fontSize: '12px', fontWeight: 600, padding: '8px 10px', borderRadius: '8px', border: 'none',
            background: '#10b981', color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5,
          }}
        >
          ✅ Approve
        </button>
        <button
          onClick={() => submit('REJECT')}
          disabled={!canSubmit}
          style={{
            flex: 1, fontSize: '12px', fontWeight: 600, padding: '8px 10px', borderRadius: '8px', border: 'none',
            background: '#ef4444', color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5,
          }}
        >
          ⛔ Reject
        </button>
      </div>
    </div>
  );
}

export default function DecisionCard() {
  const theme = useTheme();
  const { getToolOutput } = useWidgetSDK();
  const [state, setState] = useWidgetState<{ showGates: boolean }>(() => ({ showGates: true }));

  const data = getToolOutput<DecisionCardData>();
  const isDark = theme === 'dark';

  if (!data) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: isDark ? '#fff' : '#000' }}>
        Loading...
      </div>
    );
  }

  const style = DECISION_STYLE[data.decision];
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#111827';
  const mutedColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
  const cardBg = isDark ? '#242424' : '#f9fafb';

  return (
    <div style={{
      padding: '20px',
      background: bgColor,
      borderRadius: '16px',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
      color: textColor,
      maxWidth: '440px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>{style.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px', color: style.color }}>{style.label}</div>
            <div style={{ fontSize: '12px', color: mutedColor }}>Case {data.caseId}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px', color: mutedColor }}>
          Policy {data.policyVersion}
          <br />
          {data.policyVersionHash.slice(0, 8)}
        </div>
      </div>

      {(data.decision === 'APPROVE' || data.decision === 'APPROVE_WITH_REDUCTION') && (
        <div style={{ display: 'flex', gap: '12px', background: cardBg, borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: mutedColor }}>Sanctioned</div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>₹{data.score.sanctionedAmount.toLocaleString('en-IN')}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: mutedColor }}>EMI</div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>₹{data.score.emi.toLocaleString('en-IN')}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: mutedColor }}>Rate</div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>{data.score.resolvedRate}%</div>
          </div>
        </div>
      )}

      {data.decision === 'MANUAL_REVIEW' && (
        <ManualReviewPanel caseId={data.caseId} isDark={isDark} textColor={textColor} mutedColor={mutedColor} cardBg={cardBg} />
      )}

      {data.bindingConstraint && (
        <div style={{ fontSize: '13px', marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', color: isDark ? '#fca5a5' : '#b91c1c' }}>
          Binding constraint: <strong>{data.bindingConstraint}</strong>
        </div>
      )}

      <div style={{ fontSize: '13px', lineHeight: 1.5, marginBottom: '14px', color: mutedColor }}>
        {data.narrative}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <SectionButton onClick={() => setState({ showGates: !state?.showGates })} isDark={isDark} textColor={textColor}>
          {state?.showGates ? 'Hide gates' : 'Show gates'}
        </SectionButton>
      </div>

      {state?.showGates && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
          {data.gates.map((g) => (
            <div key={g.gate} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 10px', borderRadius: '6px', background: cardBg }}>
              <span style={{ fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: GATE_COLOR[g.status], marginRight: '6px' }} />
                {g.gate}
              </span>
              <span style={{ color: mutedColor }}>{g.actual}{g.unit === 'percent' ? '%' : ''} / {g.threshold}{g.unit === 'percent' ? '%' : ''}</span>
            </div>
          ))}
        </div>
      )}

      <VerifyChainSection caseId={data.caseId} isDark={isDark} textColor={textColor} mutedColor={mutedColor} cardBg={cardBg} />

      <div style={{ marginTop: '14px', fontSize: '10px', color: mutedColor, display: 'flex', justifyContent: 'space-between' }}>
        <span>SanctionDesk</span>
        <span>{data.ledgerRef}</span>
      </div>
    </div>
  );
}
