import React from 'react';
import RiskBadge from './RiskBadge';
import GoldenTimer from './GoldenTimer';
import FactorBreakdown from './FactorBreakdown';
import ActionButton from './ActionButton';
import { maskAccount } from '../utils/maskAccount';
import { twMerge } from 'tailwind-merge';
import { X, ShieldAlert, Cpu, ArrowRight, Clock, Activity, Lock, Eye, AlertTriangle, ShieldCheck, CheckCircle2, FileText } from 'lucide-react';

const InvestigationSidebar = ({ 
  isOpen, 
  selectedCase, 
  selectedTransaction, 
  actions = [], 
  onClose,
  role
}) => {
  if (!isOpen) return null;
  const isViewer = role !== 'admin';
  const [evidencePackage, setEvidencePackage] = React.useState(null);
  const [contextualReport, setContextualReport] = React.useState(null);
  const [regulatoryReport, setRegulatoryReport] = React.useState(null);

  React.useEffect(() => {
    if (selectedCase?.evidence_package) {
      setEvidencePackage(selectedCase.evidence_package);
    } else if (selectedCase?.case_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/cases/${selectedCase.case_id}/evidence`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setEvidencePackage(data); })
        .catch(() => {});
    } else if (selectedTransaction?.tx_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/transactions/${selectedTransaction.tx_id}/evidence`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setEvidencePackage(data); })
        .catch(() => {});
    } else {
      setEvidencePackage(null);
    }

    if (selectedCase?.contextual_investigation) {
      setContextualReport(selectedCase.contextual_investigation);
    } else if (selectedCase?.case_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/cases/${selectedCase.case_id}/investigation`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setContextualReport(data); })
        .catch(() => {});
    } else if (selectedTransaction?.tx_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/transactions/${selectedTransaction.tx_id}/investigation`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setContextualReport(data); })
        .catch(() => {});
    } else {
      setContextualReport(null);
    }

    if (selectedCase?.regulatory_assessment) {
      setRegulatoryReport(selectedCase.regulatory_assessment);
    } else if (selectedCase?.case_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/cases/${selectedCase.case_id}/regulatory-assessment`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setRegulatoryReport(data); })
        .catch(() => {});
    } else if (selectedTransaction?.tx_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/transactions/${selectedTransaction.tx_id}/regulatory-assessment`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setRegulatoryReport(data); })
        .catch(() => {});
    } else {
      setRegulatoryReport(null);
    }
  }, [selectedCase, selectedTransaction]);

  const totalFraud = selectedCase?.total_fraud_amount || 0;
  const recoverable = selectedCase?.recoverable_amount || 0;
  const recoveryPercent = totalFraud > 0 ? ((recoverable / totalFraud) * 100).toFixed(1) : "0.0";

  const handleAction = async (actionEndpoint) => {
    const caseId = selectedCase?.case_id || selectedTransaction?.case_id || selectedTransaction?.tx_id;
    if (!caseId) return;
    
    const targetAccount = selectedTransaction?.receiver_account || "GLOBAL";
    
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      const response = await fetch(`${API_BASE}/action/${actionEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseId,
          account_id: targetAccount,
          reason: `Action ${actionEndpoint} executed from terminal`
        })
      });
      
      if (!response.ok) {
        console.error(`Action ${actionEndpoint} failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Network error during action:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex">
        <div className="w-screen max-w-md animate-in slide-in-from-right duration-300">
          <div className="h-full flex flex-col bg-card border-l border-border/80 shadow-2xl overflow-y-auto">
            
            {/* Header - Sticky */}
            <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/80 p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                    Investigation Drawer
                  </span>
                  <h2 className="text-lg font-mono font-bold text-slate-100">
                    {selectedCase?.case_id || selectedTransaction?.tx_id || 'ANALYSIS UNIT'}
                  </h2>
                </div>
                <button 
                  onClick={onClose} 
                  className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedCase && (
                <div className="flex items-center gap-3 pt-1">
                  <RiskBadge score={selectedCase.risk_level} />
                  <GoldenTimer minutes={selectedCase.golden_window_minutes} />
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 uppercase">
                    {selectedCase.status}
                  </span>
                </div>
              )}
            </header>

            {/* Content Body */}
            <div className="flex-1 p-5 space-y-6">
              
              {/* Transaction Context */}
              {selectedTransaction && (
                <section className="bg-muted/30 rounded-xl p-4 border border-border/80">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/60">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Transaction Context</span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 uppercase">
                      {selectedTransaction.channel}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Tx ID</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {isViewer ? '••••••••' : selectedTransaction.tx_id}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 py-2 px-3 bg-slate-900/60 rounded-lg border border-border/60 text-xs font-mono">
                      <div className="flex-1 truncate">
                        <span className="text-[9px] text-slate-500 uppercase block">Sender</span>
                        <span className="text-sky-400 font-medium">
                          {isViewer ? maskAccount(selectedTransaction.sender_account) : selectedTransaction.sender_account}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div className="flex-1 truncate text-right">
                        <span className="text-[9px] text-slate-500 uppercase block">Receiver</span>
                        <span className="text-sky-400 font-medium">
                          {isViewer ? maskAccount(selectedTransaction.receiver_account) : selectedTransaction.receiver_account}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10px] font-mono text-slate-400">{new Date(selectedTransaction.timestamp).toLocaleString()}</span>
                      <span className="text-base font-mono font-bold text-slate-100">₹{selectedTransaction.amount.toLocaleString()}</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Reasoning Engine */}
              {(selectedTransaction?.full_reason || selectedTransaction?.confidence) && (
                <section className="bg-sky-500/5 rounded-xl p-4 border border-sky-500/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      Reasoning Engine & Confidence
                    </h3>
                    {selectedTransaction.confidence && (
                      <span className={twMerge(
                        "text-[9px] font-mono px-2 py-0.5 rounded font-semibold border uppercase",
                        selectedTransaction.confidence === 'HIGH' ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                        selectedTransaction.confidence === 'MEDIUM' ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                        "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      )}>
                        {selectedTransaction.confidence}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs leading-relaxed text-slate-200 italic bg-slate-900/40 p-3 rounded-lg border border-border/40">
                    "{selectedTransaction.full_reason}"
                  </p>

                  {/* Feature Importance */}
                  {selectedTransaction.ml_feature_importance && (
                    <div className="pt-2 space-y-2">
                      <span className="text-[10px] uppercase font-semibold text-slate-400">Model Influence Factors</span>
                      <div className="space-y-2">
                        {Object.entries(selectedTransaction.ml_feature_importance).slice(0, 5).map(([feature, importance]) => (
                          <div key={feature} className="space-y-1">
                            <div className="flex justify-between text-[10px] font-mono">
                              <span className="text-slate-300">{feature.replace(/_/g, ' ')}</span>
                              <span className="text-sky-400 font-semibold">{(importance * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-sky-400" 
                                style={{ width: `${importance * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Factor Analysis */}
              {selectedTransaction?.risk_factors && (
                <section>
                  <FactorBreakdown factors={selectedTransaction.risk_factors} />
                </section>
              )}

              {/* Evidence Collection Agent (Phase 1) */}
              {evidencePackage && evidencePackage.evidence && evidencePackage.evidence.length > 0 && (
                <section className="bg-slate-900/50 rounded-xl p-4 border border-sky-500/20 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-border/60">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                      Evidence Collection Agent
                    </h3>
                    <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/60 uppercase">
                      {evidencePackage.summary?.total_evidence_items || evidencePackage.evidence.length} Facts
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1 text-xs">
                    {evidencePackage.evidence.map((item) => (
                      <div key={item.id} className="p-2.5 rounded-lg bg-card/80 border border-border/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                            {item.category}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={twMerge(
                              "text-[8px] font-mono px-1.5 py-0.5 rounded font-bold uppercase border",
                              item.severity === 'HIGH' ? "bg-rose-500/15 text-rose-400 border-rose-500/30" :
                              item.severity === 'MEDIUM' ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                              item.severity === 'LOW' ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
                              "bg-sky-500/15 text-sky-400 border-sky-500/30"
                            )}>
                              {item.severity}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500">
                              {item.source}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-200 leading-snug">
                          {item.finding}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Contextual Investigation Agent (Phase 2) */}
              {contextualReport && contextualReport.contextual_findings && contextualReport.contextual_findings.length > 0 && (
                <section className="bg-slate-900/50 rounded-xl p-4 border border-indigo-500/20 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-border/60">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-indigo-400" />
                      Contextual Investigation Agent
                    </h3>
                    <span
                      title="Rule-based contextual confidence index; not a calibrated probability."
                      className={twMerge(
                        "text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase cursor-help",
                        contextualReport.summary?.contextual_severity === 'CRITICAL' ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                        contextualReport.summary?.contextual_severity === 'HIGH' ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                        "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      )}
                    >
                      {contextualReport.summary?.contextual_severity || 'HIGH'} · HEURISTIC INDEX {((contextualReport.summary?.confidence || 0)).toFixed(2)}
                    </span>
                  </div>

                  {/* Matched Patterns */}
                  {contextualReport.patterns && contextualReport.patterns.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                        Matched Behavioral Patterns ({contextualReport.patterns.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {contextualReport.patterns.map((p) => (
                          <span key={p.pattern_id} className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-semibold">
                            {p.pattern_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Findings with supporting evidence IDs */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                    {contextualReport.contextual_findings.map((f) => (
                      <div key={f.id} className="p-2.5 rounded-lg bg-card/80 border border-border/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">
                            {f.id} • {f.type}
                          </span>
                          <div className="flex items-center gap-1">
                            {f.supporting_evidence_ids && f.supporting_evidence_ids.map((evId) => (
                              <span key={evId} className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                {evId}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-200 leading-snug">
                          {f.finding}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Regulatory Risk Assessment Agent (Phase 3) */}
              {regulatoryReport && regulatoryReport.regulatory_indicators && regulatoryReport.regulatory_indicators.length > 0 && (
                <section className="bg-slate-900/50 rounded-xl p-4 border border-purple-500/20 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-border/60">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      Regulatory Risk Assessment
                    </h3>
                    <span
                      title="Rule-based regulatory heuristic index; not a calibrated probability."
                      className={twMerge(
                        "text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase cursor-help",
                        regulatoryReport.summary?.regulatory_severity === 'CRITICAL' ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                        regulatoryReport.summary?.regulatory_severity === 'HIGH' ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                        "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      )}
                    >
                      {regulatoryReport.summary?.regulatory_severity || 'HIGH'} · HEURISTIC INDEX {((regulatoryReport.summary?.assessment_heuristic_index || 0)).toFixed(2)}
                    </span>
                  </div>

                  {/* Regulatory Indicators */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                    {regulatoryReport.regulatory_indicators.map((reg) => (
                      <div key={reg.id} className="p-2.5 rounded-lg bg-card/80 border border-border/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">
                            {reg.id} • {reg.indicator_code}
                          </span>
                          <div className="flex items-center gap-1">
                            {reg.supporting_evidence_ids && reg.supporting_evidence_ids.map((evId) => (
                              <span key={evId} className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                {evId}
                              </span>
                            ))}
                            {reg.supporting_context_ids && reg.supporting_context_ids.map((ctxId) => (
                              <span key={ctxId} className="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                {ctxId}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-200 leading-snug">
                          {reg.indicator}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Compliance Considerations */}
                  {regulatoryReport.compliance_considerations && regulatoryReport.compliance_considerations.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      <span className="text-[9px] font-mono font-bold text-purple-400 uppercase tracking-wider block">
                        Compliance Review Considerations
                      </span>
                      {regulatoryReport.compliance_considerations.map((c, idx) => (
                        <div key={idx} className="text-[11px] text-slate-300 bg-purple-950/30 p-2 rounded border border-purple-900/40">
                          • {c.recommendation}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Action Decision Terminal */}
              <section className="bg-card border border-border/80 rounded-xl p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Decision Terminal</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleAction('freeze')} disabled={isViewer} className="py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40">
                    Freeze Account
                  </button>
                  <button onClick={() => handleAction('monitor')} disabled={isViewer} className="py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40">
                    Monitor Account
                  </button>
                  <button onClick={() => handleAction('flag')} disabled={isViewer} className="py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40">
                    Escalate Case
                  </button>
                  <button onClick={() => handleAction('alert')} disabled={isViewer} className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40">
                    Alert Police
                  </button>
                  <button onClick={() => handleAction('close')} disabled={isViewer} className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40">
                    Close (Resolved)
                  </button>
                  <button onClick={() => handleAction('close_fp')} disabled={isViewer} className="py-2 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40">
                    Close (False Pos)
                  </button>
                </div>
              </section>

              {/* Graph Summary */}
              {selectedCase && (
                <section className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 p-3 rounded-xl border border-border/80">
                    <span className="text-[9px] uppercase font-semibold text-slate-400 block">Chain Depth</span>
                    <span className="text-sm font-mono font-bold text-slate-100">{selectedCase.chain.length} Hops</span>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-xl border border-border/80">
                    <span className="text-[9px] uppercase font-semibold text-slate-400 block">Recovery %</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">{recoveryPercent}%</span>
                  </div>
                </section>
              )}

              {/* Action Timeline */}
              <section className="pb-6">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Action History</h3>
                <div className="space-y-3 border-l border-border/80 ml-2 pl-4">
                  {actions.length > 0 ? actions.map((action) => (
                    <div key={action.action_id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-sky-400 border-2 border-card" />
                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-xs font-mono font-semibold text-sky-400 uppercase">
                            {action.action_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">
                            {new Date(action.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Target: <span className="font-mono font-semibold">
                            {isViewer ? maskAccount(action.target) : action.target}
                          </span>
                        </p>
                        <p className="text-[9px] text-slate-400">Actor Role: {action.actor_role}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-xs text-slate-400 italic">No investigative actions recorded.</p>
                  )}
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestigationSidebar;

