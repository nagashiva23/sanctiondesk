'use client';

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

      {data.decision !== 'REJECT' && (
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

      {data.bindingConstraint && (
        <div style={{ fontSize: '13px', marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', color: isDark ? '#fca5a5' : '#b91c1c' }}>
          Binding constraint: <strong>{data.bindingConstraint}</strong>
        </div>
      )}

      <div style={{ fontSize: '13px', lineHeight: 1.5, marginBottom: '14px', color: mutedColor }}>
        {data.narrative}
      </div>

      <button
        onClick={() => setState({ showGates: !state?.showGates })}
        style={{
          fontSize: '12px', padding: '6px 10px', borderRadius: '8px',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
          background: 'transparent', color: textColor, cursor: 'pointer', marginBottom: '10px',
        }}
      >
        {state?.showGates ? 'Hide gates' : 'Show gates'}
      </button>

      {state?.showGates && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

      <div style={{ marginTop: '14px', fontSize: '10px', color: mutedColor, display: 'flex', justifyContent: 'space-between' }}>
        <span>SanctionDesk</span>
        <span>{data.ledgerRef}</span>
      </div>
    </div>
  );
}
