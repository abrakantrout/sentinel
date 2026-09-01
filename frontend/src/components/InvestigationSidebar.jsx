import React from 'react';
import RiskBadge from './RiskBadge';
import GoldenTimer from './GoldenTimer';
import FactorBreakdown from './FactorBreakdown';
import ActionButton from './ActionButton';
import { maskAccount } from '../utils/maskAccount';
import { twMerge } from 'tailwind-merge';
import { X, ShieldAlert, Cpu, ArrowRight, Clock, Activity, Lock, Eye, AlertTriangle, ShieldCheck, CheckCircle2, FileText, BookOpen } from 'lucide-react';

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
  const [auditExplanation, setAuditExplanation] = React.useState(null);
  const [decisionSupport, setDecisionSupport] = React.useState(null);
  const [selectedDispositionCode, setSelectedDispositionCode] = React.useState('');
  const [analystNotes, setAnalystNotes] = React.useState('');
  const [riskAcknowledged, setRiskAcknowledged] = React.useState(false);
  const [dispositionResponse, setDispositionResponse] = React.useState(null);
  const [isSubmittingDisposition, setIsSubmittingDisposition] = React.useState(false);
  const [caseHistory, setCaseHistory] = React.useState(null);

  const fetchCaseHistory = React.useCallback((caseId) => {
    if (!caseId) {
      setCaseHistory(null);
      return;
    }
    const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    fetch(`${API_BASE}/cases/${caseId}/history`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.found) setCaseHistory(data); })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (selectedCase?.case_id) {
      fetchCaseHistory(selectedCase.case_id);
    } else {
      setCaseHistory(null);
    }
  }, [selectedCase?.case_id, fetchCaseHistory]);

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

    if (selectedCase?.audit_explanation) {
      setAuditExplanation(selectedCase.audit_explanation);
    } else if (selectedCase?.case_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/cases/${selectedCase.case_id}/audit-explanation`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setAuditExplanation(data); })
        .catch(() => {});
    } else if (selectedTransaction?.tx_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/transactions/${selectedTransaction.tx_id}/audit-explanation`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setAuditExplanation(data); })
        .catch(() => {});
    } else {
      setAuditExplanation(null);
    }

    if (selectedCase?.analyst_decision_support) {
      setDecisionSupport(selectedCase.analyst_decision_support);
    } else if (selectedCase?.case_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/cases/${selectedCase.case_id}/decision-support`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setDecisionSupport(data); })
        .catch(() => {});
    } else if (selectedTransaction?.tx_id) {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      fetch(`${API_BASE}/transactions/${selectedTransaction.tx_id}/decision-support`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data && data.found) setDecisionSupport(data); })
        .catch(() => {});
    } else {
      setDecisionSupport(null);
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
                  <span className={twMerge(
                    "text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase",
                    (caseHistory?.current_case_status || selectedCase.status) === 'RESOLVED_DISMISSED' ? "bg-slate-800 text-slate-300 border-slate-700" :
                    (caseHistory?.current_case_status || selectedCase.status) === 'RESOLVED_APPROVED' ? "bg-emerald-950 text-emerald-300 border-emerald-800" :
                    (caseHistory?.current_case_status || selectedCase.status) === 'CDD_PENDING' ? "bg-yellow-950 text-yellow-300 border-yellow-800" :
                    (caseHistory?.current_case_status || selectedCase.status) === 'ESCALATED' ? "bg-rose-950 text-rose-300 border-rose-800" :
                    (caseHistory?.current_case_status || selectedCase.status) === 'UNDER_REVIEW' ? "bg-sky-950 text-sky-300 border-sky-800" :
                    "bg-indigo-950 text-indigo-300 border-indigo-800"
                  )}>
                    STATUS: {caseHistory?.current_case_status || selectedCase.status}
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

              {/* Audit Explanation Agent (Phase 4) */}
              {auditExplanation && auditExplanation.found && (
                <section className="bg-slate-900/50 rounded-xl p-4 border border-teal-500/20 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-border/60">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                      Audit Explanation
                    </h3>
                    <span
                      title="Automated, traceable explanation derived strictly from Phase 1-3 upstream investigation."
                      className={twMerge(
                        "text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase cursor-help",
                        auditExplanation.status === 'SUCCESS' ? "bg-teal-500/20 text-teal-300 border-teal-500/40" :
                        auditExplanation.status === 'INCOMPLETE_TRACEABILITY' ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                        "bg-slate-700/50 text-slate-300 border-slate-600"
                      )}
                    >
                      {auditExplanation.status}
                    </span>
                  </div>

                  {/* Executive Summary */}
                  <div className="p-2.5 rounded-lg bg-teal-950/20 border border-teal-900/40 text-xs">
                    <span className="text-[9px] font-mono font-bold text-teal-400 uppercase tracking-wider block mb-1">Executive Summary</span>
                    <p className="text-[11px] text-slate-200 leading-snug">
                      {auditExplanation.executive_summary}
                    </p>
                  </div>

                  {/* Investigation Narrative Chain */}
                  {auditExplanation.investigation_narrative && auditExplanation.investigation_narrative.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[9px] font-mono font-bold text-teal-400 uppercase tracking-wider block">
                        Investigation Chain
                      </span>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs">
                        {auditExplanation.investigation_narrative.map((item) => (
                          <div key={item.step} className="p-2 rounded bg-card/80 border border-border/60 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">
                                STEP {item.step} • {item.stage}
                              </span>
                              <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-teal-300 border border-slate-700">
                                {item.claim_type}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-200 leading-snug">
                              {item.statement}
                            </p>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {item.evidence_ids && item.evidence_ids.map((evId) => (
                                <span key={evId} className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                  {evId}
                                </span>
                              ))}
                              {item.context_finding_ids && item.context_finding_ids.map((ctxId) => (
                                <span key={ctxId} title="Context Finding ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                  {ctxId}
                                </span>
                              ))}
                              {item.context_pattern_ids && item.context_pattern_ids.map((patId) => (
                                <span key={patId} title="Matched Context Pattern" className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                  PAT:{patId}
                                </span>
                              ))}
                              {item.regulatory_ids && item.regulatory_ids.map((regId) => (
                                <span key={regId} className="text-[8px] font-mono px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/60">
                                  {regId}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Uncertainties & System Data Gaps */}
                  {auditExplanation.uncertainties && auditExplanation.uncertainties.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-1 text-xs">
                      <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                        Uncertainties & Data Limitations
                      </span>
                      {auditExplanation.uncertainties.map((unc, idx) => (
                        <div key={idx} className="text-[10px] text-slate-400 bg-slate-950/40 p-1.5 rounded border border-slate-800">
                          • {unc}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Phase 5 — Analyst Decision Support Agent */}
              {decisionSupport && (
                <section className="bg-card border border-indigo-900/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-indigo-900/40 pb-2">
                    <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      Phase 5 — Analyst Decision Support Agent
                    </h3>
                    <span
                      title="Human-in-the-Loop Analyst Decision Support & Review Workflow."
                      className={twMerge(
                        "text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase cursor-help",
                        decisionSupport.status === 'SUCCESS' ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" :
                        decisionSupport.status === 'INCOMPLETE_TRACEABILITY' ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                        "bg-slate-700/50 text-slate-300 border-slate-600"
                      )}
                    >
                      {decisionSupport.status}
                    </span>
                  </div>

                  {/* Operational Metrics Bar */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-900/60 border border-slate-800 space-y-0.5">
                      <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Operational Priority</span>
                      <span className={twMerge(
                        "text-xs font-mono font-bold px-1.5 py-0.5 rounded border inline-block",
                        decisionSupport.review_priority === 'URGENT' ? "bg-rose-950 text-rose-300 border-rose-800" :
                        decisionSupport.review_priority === 'HIGH' ? "bg-amber-950 text-amber-300 border-amber-800" :
                        decisionSupport.review_priority === 'STANDARD' ? "bg-yellow-950 text-yellow-300 border-yellow-800" :
                        "bg-slate-800 text-slate-300 border-slate-700"
                      )}>
                        {decisionSupport.review_priority || 'LOW'}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-900/60 border border-slate-800 space-y-0.5">
                      <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block">Heuristic Index</span>
                      <span className="text-xs font-mono font-bold text-teal-300 block">
                        {decisionSupport.summary?.assessment_heuristic_index !== undefined && decisionSupport.summary?.assessment_heuristic_index !== null && decisionSupport.status === 'SUCCESS'
                          ? decisionSupport.summary.assessment_heuristic_index.toFixed(2)
                          : 'UNAVAILABLE'}
                      </span>
                    </div>
                  </div>

                  {/* Human Approval Boundary Badge */}
                  <div className="p-2 rounded bg-indigo-950/30 border border-indigo-800/40 text-[10px] flex items-center justify-between text-indigo-300">
                    <span>Human Approval Required: <strong className="text-indigo-200">YES</strong></span>
                    <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-indigo-900/60 border border-indigo-700 text-indigo-200">
                      Autonomous Execution: DISABLED
                    </span>
                  </div>

                  {/* Executive Brief */}
                  {decisionSupport.analyst_executive_brief && (
                    <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-xs">
                      <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider block mb-1">Analyst Executive Brief</span>
                      <p className="text-[11px] text-slate-200 leading-snug">
                        {decisionSupport.analyst_executive_brief}
                      </p>
                    </div>
                  )}

                  {/* Recommended Review Steps */}
                  {decisionSupport.recommended_review_steps && decisionSupport.recommended_review_steps.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider block">
                        Recommended Review Steps ({decisionSupport.recommended_review_steps.length})
                      </span>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs">
                        {decisionSupport.recommended_review_steps.map((step) => (
                          <div key={step.step_id} className="p-2 rounded bg-card/80 border border-border/60 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono font-bold text-indigo-300 uppercase">
                                {step.step_id} • {step.category}
                              </span>
                              <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 border border-slate-700">
                                PRIORITY: {step.priority}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-100 block">
                              {step.action_label}
                            </span>
                            <p className="text-[10px] text-slate-300 leading-snug">
                              {step.description}
                            </p>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {step.supporting_evidence_ids && step.supporting_evidence_ids.map((evId) => (
                                <span key={evId} title="Evidence ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                  {evId}
                                </span>
                              ))}
                              {step.supporting_context_finding_ids && step.supporting_context_finding_ids.map((ctxId) => (
                                <span key={ctxId} title="Context Finding ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                  {ctxId}
                                </span>
                              ))}
                              {step.supporting_context_pattern_ids && step.supporting_context_pattern_ids.map((patId) => (
                                <span key={patId} title="Matched Context Pattern" className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                  PAT:{patId}
                                </span>
                              ))}
                              {step.supporting_regulatory_ids && step.supporting_regulatory_ids.map((regId) => (
                                <span key={regId} title="Regulatory Indicator ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/60">
                                  {regId}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disposition Options Form (Stateful Case Lifecycle Intent) */}
                  {selectedCase && decisionSupport.disposition_options && (
                    <div className="pt-2 border-t border-indigo-900/40 space-y-2 text-xs">
                      <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider block">
                        Analyst Disposition Terminal (Stateful Lifecycle Engine)
                      </span>
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!selectedCase?.case_id || !selectedDispositionCode) return;
                        setIsSubmittingDisposition(true);
                        setDispositionResponse(null);
                        const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
                        try {
                          const res = await fetch(`${API_BASE}/cases/${selectedCase.case_id}/disposition`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              case_id: selectedCase.case_id,
                              action_code: selectedDispositionCode,
                              analyst_notes: analystNotes,
                              analyst_id: "ANALYST-001",
                              analyst_role: "COMPLIANCE_ANALYST",
                              risk_acknowledged: riskAcknowledged
                            })
                          });
                          const data = await res.json();
                          setDispositionResponse(data);
                          if (data.ok) {
                            fetchCaseHistory(selectedCase.case_id);
                          }
                        } catch (err) {
                          setDispositionResponse({ ok: false, error: 'Network error submitting disposition.' });
                        } finally {
                          setIsSubmittingDisposition(false);
                        }
                      }} className="space-y-2">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Select Disposition Option:</label>
                          <select
                            value={selectedDispositionCode}
                            onChange={(e) => {
                              setSelectedDispositionCode(e.target.value);
                              setDispositionResponse(null);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded p-1.5"
                          >
                            <option value="">-- Choose Disposition Intent --</option>
                            {decisionSupport.disposition_options.map((opt) => (
                              <option key={opt.action_code} value={opt.action_code}>
                                {opt.label} {opt.requires_risk_acknowledgement ? '(Requires Risk Ack)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedDispositionCode && (
                          <>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Analyst Rationale / Notes:</label>
                              <textarea
                                value={analystNotes}
                                onChange={(e) => setAnalystNotes(e.target.value)}
                                placeholder="Enter rationale for compliance record..."
                                rows={2}
                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded p-1.5"
                              />
                            </div>

                            {decisionSupport.disposition_options.find(o => o.action_code === selectedDispositionCode)?.requires_risk_acknowledgement && (
                              <label className="flex items-center gap-2 text-[10px] text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-800">
                                <input
                                  type="checkbox"
                                  checked={riskAcknowledged}
                                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                                  className="rounded border-slate-700"
                                />
                                I acknowledge compliance risk and confirm escalation.
                              </label>
                            )}

                            <button
                              type="submit"
                              disabled={isSubmittingDisposition || isViewer}
                              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-colors disabled:opacity-40"
                            >
                              {isSubmittingDisposition ? 'Submitting...' : 'Submit Analyst Disposition Intent'}
                            </button>
                          </>
                        )}
                      </form>

                      {dispositionResponse && (
                        <div className={twMerge(
                          "p-2 rounded border text-[10px]",
                          dispositionResponse.ok ? "bg-emerald-950/60 border-emerald-800 text-emerald-300" : "bg-rose-950/60 border-rose-800 text-rose-300"
                        )}>
                          {dispositionResponse.ok ? (
                            <div>
                              <strong>✓ Disposition Executed & State Persisted</strong>
                              <p className="mt-0.5 leading-snug">{dispositionResponse.message}</p>
                            </div>
                          ) : (
                            <div>
                              <strong>✗ Disposition Rejected</strong>
                              <p className="mt-0.5 leading-snug">{dispositionResponse.error || 'Validation error.'}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Analyst Audit History Feed (Phase 6 Persistent Audit Log) */}
                  {caseHistory?.audit_history && caseHistory.audit_history.length > 0 && (
                    <div className="pt-3 border-t border-indigo-900/40 space-y-2">
                      <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider block">
                        Analyst Audit History Feed ({caseHistory.audit_history.length})
                      </span>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {caseHistory.audit_history.map((item) => (
                          <div key={item.audit_id} className="p-2 rounded-lg bg-slate-900/80 border border-indigo-900/50 space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono font-bold text-indigo-300">
                                {item.analyst_id} • {item.analyst_role}
                              </span>
                              <span className="text-[8px] font-mono text-slate-400">
                                {new Date(item.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-200 border border-indigo-800 font-bold uppercase">
                                {item.action_code}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">
                                {item.previous_case_status} → <strong className="text-teal-300">{item.new_case_status}</strong>
                              </span>
                            </div>

                            {item.analyst_notes && (
                              <p className="text-[10px] text-slate-300 italic bg-slate-950/40 p-1.5 rounded border border-slate-800 leading-snug">
                                "{item.analyst_notes}"
                              </p>
                            )}

                            {item.risk_acknowledged && (
                              <span className="inline-block text-[8px] font-mono px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                Risk Ack: CONFIRMED
                              </span>
                            )}

                            {/* Traceability Chips */}
                            {item.traceability_chain && (
                              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/60">
                                {item.traceability_chain.supporting_evidence_ids?.map((evId) => (
                                  <span key={evId} title="Evidence ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                    {evId}
                                  </span>
                                ))}
                                {item.traceability_chain.supporting_context_finding_ids?.map((ctxId) => (
                                  <span key={ctxId} title="Context Finding ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                    {ctxId}
                                  </span>
                                ))}
                                {item.traceability_chain.supporting_context_pattern_ids?.map((patId) => (
                                  <span key={patId} title="Matched Context Pattern" className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                    PAT:{patId}
                                  </span>
                                ))}
                                {item.traceability_chain.supporting_regulatory_ids?.map((regId) => (
                                  <span key={regId} title="Regulatory Indicator ID" className="text-[8px] font-mono px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/60">
                                    {regId}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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

