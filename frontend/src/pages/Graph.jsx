import { useMemo, useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import GraphModule from '../modules/GraphModule';
import ErrorBoundary from '../components/ErrorBoundary';

const Graph = () => {
  const { caseId } = useParams();
  const { cases, actions, connectionStatus, lastTxEvent } = useWebSocket();
  const [fetchedCase, setFetchedCase] = useState(null);

  useEffect(() => {
    if (!caseId) return;
    const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    fetch(`${API_BASE}/cases/${caseId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.case_id) {
          setFetchedCase(data);
        }
      })
      .catch(() => {});
  }, [caseId]);

  const selectedCase = useMemo(
    () => cases.find((c) => c.case_id === caseId) || null,
    [caseId, cases]
  );

  const activeCase = fetchedCase || selectedCase;

  const handleAction = useCallback(async (type, payload) => {
    const endpointByType = {
      freeze: '/action/freeze',
      flag: '/action/flag',
      alert: '/action/alert',
      monitor: '/action/monitor',
      close: '/action/close',
      close_fp: '/action/close_fp'
    };
    const endpoint = endpointByType[type];
    if (!endpoint) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const actionPayload = {
      case_id: caseId,
      account_id: payload?.accountId || payload?.target || 'GLOBAL',
      ...payload
    };
    
    let res;
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionPayload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      throw new Error(`Action failed with status ${res.status}`);
    }
  }, [caseId]);

  if (!activeCase && cases.length === 0 && connectionStatus === 'LIVE') {
    return (
      <div className="flex items-center justify-center h-full p-8 text-slate-400 font-mono text-xs">
        Loading case graph...
      </div>
    );
  }

  if (connectionStatus === 'OFFLINE' && !activeCase) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-rose-400 font-mono text-xs">
        Graph unavailable while offline.
      </div>
    );
  }

  if (!activeCase) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-slate-400 font-mono text-xs">
        No case selected or case not found.
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-full h-full flex flex-col overflow-hidden" style={{ height: '100vh', maxHeight: '100vh' }}>
        <GraphModule
          caseData={activeCase}
          actions={actions}
          onAction={handleAction}
          connectionStatus={connectionStatus}
          newTransactionEvent={lastTxEvent}
        />
      </div>
    </ErrorBoundary>
  );
};

export default Graph;

