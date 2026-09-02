import { useMemo, useRef, useState, useCallback } from 'react';
import GraphCanvas from './GraphCanvas';
import Legend from './Legend';
import RecoveryBar from './RecoveryBar';
import ActionPanel from './ActionPanel';
import NodeActions from './NodeActions';
import './GraphModule.css';

import { getRole } from '../../roleStore';

const GraphModule = ({ caseData, actions = [], onAction, connectionStatus }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [selectionInfo, setSelectionInfo] = useState(null);
  const [processingNodes, setProcessingNodes] = useState({});
  const [lastActionStatus, setLastActionStatus] = useState('READY');
  const canvasRef = useRef(null);
  const role = getRole();

  if (!caseData) return null;

  const nodes = useMemo(() => Array.isArray(caseData.nodes) ? caseData.nodes : [], [caseData.nodes]);
  const edges = useMemo(() => Array.isArray(caseData.edges) ? caseData.edges : [], [caseData.edges]);
  const actionLog = useMemo(() => Array.isArray(caseData.actionLog) ? caseData.actionLog : actions.filter((a) => a.case_id === caseData.case_id), [actions, caseData.actionLog, caseData.case_id]);

  const recovery = useMemo(() => {
    const totalFraud = Number(caseData.total_fraud_amount || 0);
    const recovered = Number(caseData.recovered_amount || 0);
    const inflight = Number(caseData.recoverable_amount || 0);
    const lost = Math.max(totalFraud - recovered - inflight, 0);
    const percentage = totalFraud > 0 ? (((recovered + inflight) / totalFraud) * 100).toFixed(1) : '0.0';
    return { totalFraud, recovered, inflight, lost, percentage };
  }, [caseData.recoverable_amount, caseData.recovered_amount, caseData.total_fraud_amount]);

  const leadNodeId = useMemo(() => {
    if (!nodes.length || !edges.length) return null;
    const inflow = {};
    edges.forEach(edge => {
      const target = edge.target || edge.to;
      const amount = Number(edge.amount || 0);
      if (target) {
        inflow[target] = (inflow[target] || 0) + amount;
      }
    });
    const suspects = Object.keys(inflow).sort((a, b) => inflow[b] - inflow[a]);
    return suspects.length > 0 ? suspects[0] : null;
  }, [nodes, edges]);

  const handleAction = useCallback(async (type, payload) => {
    if (role !== 'admin') {
      console.warn(`[SENTINEL] Unauthorized action attempt: ${type}`);
      return;
    }

    const accountId = payload?.accountId || payload?.target || 'GLOBAL';
    if (processingNodes[accountId]) return;
    setProcessingNodes((prev) => ({ ...prev, [accountId]: true }));
    setLastActionStatus('BUSY');

    if (accountId !== 'GLOBAL' && canvasRef.current?.highlightNode) {
      canvasRef.current.highlightNode(accountId);
    }

    try {
      const mappedType = type.toLowerCase();
      await onAction?.(mappedType, payload);
      setLastActionStatus('READY');
    } catch {
      setLastActionStatus('ERROR');
    } finally {
      setProcessingNodes((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    }
  }, [onAction, processingNodes, role]);

  const handleLogClick = useCallback((nodeId) => {
    if (canvasRef.current?.highlightNode) {
      canvasRef.current.highlightNode(nodeId, 1500);
    }
  }, []);

  const executeAction = useCallback((actionType, payload) => handleAction(actionType, payload), [handleAction]);
  const isGraphEmpty = nodes.length === 0 || edges.length === 0;

  return (
    <div className="sentinel-shell">
      <RecoveryBar recovery={recovery} role={role} />
      <div className="dashboard-frame">
        <div className="graph-pane graph-wrapper" style={{ position: 'relative' }}>
          <Legend />
          {selectionInfo && (
            <div style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 40,
              background: 'rgba(15, 23, 42, 0.94)',
              border: '1px solid #F59E0B',
              color: '#F59E0B',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '700',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)'
            }}>
              <span>🔗 INVESTIGATION PATH</span>
              <span style={{ color: '#E2E8F0', fontWeight: '600' }}>· {selectionInfo.hops} {selectionInfo.hops === 1 ? 'HOP' : 'HOPS'} DETECTED</span>
            </div>
          )}
          {connectionStatus === 'OFFLINE' && (
            <div className="graph-state-message">Connection offline. Waiting for backend...</div>
          )}
          {connectionStatus !== 'OFFLINE' && isGraphEmpty && (
            <div className="graph-state-message">No graph data available for this case yet.</div>
          )}
          <GraphCanvas
            ref={canvasRef}
            nodes={nodes}
            edges={edges}
            onNodeClick={(node) => {
              setSelectedNode(node);
              setSelectedEdge(null);
            }}
            onEdgeClick={(edge) => {
              setSelectedEdge(edge);
              setSelectedNode(null);
            }}
            onSelectionChange={setSelectionInfo}
          />
          {selectedNode && (
            <NodeActions
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              executeAction={executeAction}
              processingNodes={processingNodes}
              role={role}
            />
          )}
          {selectedEdge && (
            <div style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              background: '#0F172A',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '14px 18px',
              color: '#F8FAFC',
              fontSize: '12px',
              zIndex: 50,
              minWidth: '280px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '700', color: '#F59E0B' }}>TRANSACTION DETAILS</span>
                <button
                  onClick={() => setSelectedEdge(null)}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                >✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div><span style={{ color: '#64748B' }}>TX ID:</span> {selectedEdge.tx_id || selectedEdge.id}</div>
                <div><span style={{ color: '#64748B' }}>Amount:</span> ₹{Number(selectedEdge.amount || 0).toLocaleString('en-IN')}</div>
                <div><span style={{ color: '#64748B' }}>Hop:</span> {selectedEdge.hop_number || 1} / {selectedEdge.total_hops || 1}</div>
                <div><span style={{ color: '#64748B' }}>Pattern:</span> {selectedEdge.pattern_type || 'STANDARD'}</div>
                <div><span style={{ color: '#64748B' }}>From:</span> {selectedEdge.source || selectedEdge.from}</div>
                <div><span style={{ color: '#64748B' }}>To:</span> {selectedEdge.target || selectedEdge.to}</div>
              </div>
            </div>
          )}
        </div>
        <div className="intelligence-pane">
          <ActionPanel
            caseId={caseData.case_id}
            caseState={caseData.status}
            lastActionStatus={lastActionStatus}
            leadNodeId={leadNodeId}
            processingNodes={processingNodes}
            actionLog={actionLog}
            executeAction={executeAction}
            onLogClick={handleLogClick}
            connectionStatus={connectionStatus}
            role={role}
          />
        </div>
      </div>
    </div>
  );
};

export default GraphModule;

