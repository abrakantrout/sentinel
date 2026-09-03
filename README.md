# SENTINEL — Real-Time Financial Crime & Fraud Intelligence Platform

**SENTINEL** is an enterprise-grade financial crime and fraud intelligence platform combining real-time transaction monitoring, hybrid risk scoring, deterministic policy governance, automated 5-stage investigation orchestration, multi-hop network traversal, local AI advisory intelligence, and an analyst investigation workstation with a strict human approval boundary.

---

## 📋 Table of Contents

1. [Project Overview](#-project-overview)
2. [Core Architecture](#-core-architecture)
3. [Monorepo Directory Structure](#-monorepo-directory-structure)
4. [Investigation Pipeline (5-Stage)](#-investigation-pipeline-5-stage)
5. [Multi-Hop Network Investigation](#-multi-hop-network-investigation)
6. [Analyst Investigation Workstation](#-analyst-investigation-workstation)
7. [Local AI / Qwen Advisory Intelligence](#-local-ai--qwen-advisory-intelligence)
8. [Autonomous Action & Deterministic Policy Engine](#-autonomous-action--deterministic-policy-engine)
9. [Freeze & Human Approval Boundary](#-freeze--human-approval-boundary)
10. [Automation Mode](#-automation-mode)
11. [Implemented Actions Catalog](#-implemented-actions-catalog)
12. [Audit System & CSV Export](#-audit-system--csv-export)
13. [Case Queue & Lifecycle Management](#-case-queue--lifecycle-management)
14. [Realtime Event Bus & WebSockets](#-realtime-event-bus--websockets)
15. [Testing & Build Validation](#-testing--build-validation)
16. [Security & Governance Principles](#-security--governance-principles)
17. [Google Stitch UI Development](#-google-stitch-ui-development)
18. [Current Implementation Status](#-current-implementation-status)
19. [Environment Variables](#-environment-variables)
20. [Getting Started & Running](#-getting-started--running)

---

## 🎯 Project Overview

SENTINEL safeguards financial institutions against complex fraud networks, mule chains, account takeovers, and high-velocity money laundering scheme execution. It bridges automated detection with human oversight through a four-tier operational architecture:

```mermaid
graph TD
    TS["TRANSACTION STREAM<br/>(Simulator / Ingestion API)"] --> DE["HYBRID SCORING ENGINE<br/>(Rule + ML Feature Importance)"]
    DE --> DPE["DETERMINISTIC POLICY ENGINE<br/>(autonomous_policy_engine.py)"]
    
    subgraph "Parallel Advisory & Orchestration"
        IO["5-STAGE INVESTIGATION ORCHESTRATOR<br/>(Evidence → Contextual → Regulatory → Audit → Decision)"]
        AI["LOCAL QWEN 3:8B ADVISORY AI<br/>(Ollama Runtime)"]
    end
    
    DE --> IO
    DE --> AI
    
    DPE -->|Policy Execution| SAE["SIMULATED ACTION EXECUTOR<br/>(simulated_action_executor.py)"]
    IO -->|Report Package| AIW["ANALYST WORKSTATION<br/>(React + Cytoscape.js)"]
    AI -->|Structured Brief| AIW
    
    SAE -->|Auto Action: Monitor / Block / STR| AL["IMMUTABLE AUDIT LOG<br/>(21-Field PostgreSQL / CSV Export)"]
    AIW -->|Human Freeze Approval| SAE
    SAE -->|Freeze Execution| AL
```

### Core System Pillars

- **Real-Time Transaction Stream Processing**: Async ingestion, hybrid rule scoring, and ML feature importance calculation.
- **Deterministic Policy Governance**: Fixed risk thresholds mapping to predefined enforcement actions (`MONITOR`, `ENHANCED_MONITORING`, `ESCALATE_ANALYST_REVIEW`, `FREEZE`, `BLOCK`, `FILE_STR`, `CLOSE_ACCOUNT`, `REJECT_TRANSACTION`).
- **Automated 5-Stage Agent Orchestration**: Sequential execution of specialized analytical agents producing comprehensive case briefs.
- **Multi-Hop Network Graph Traversal**: Detection and visual highlighting of complex money movement topologies (mule chains, funnels, fan-outs, circular flows).
- **Analyst Investigation Workstation**: Interactive Cytoscape.js graph canvas, transaction deep-dive inspector, stage progress timeline, and report viewing modals.
- **Local Qwen 3:8B Advisory Intelligence**: Off-grid Ollama LLM integration producing evidence-grounded risk summaries and network explanations.
- **Strict Human Approval Boundary**: Operational safeguard requiring explicit analyst confirmation for high-impact `FREEZE` actions.
- **Authoritative Compliance Audit Trail**: 21-field structured audit records stored in PostgreSQL with Excel-compatible UTF-8 BOM CSV export.

---

## 🏗️ Core Architecture

SENTINEL implements a modern, decoupled client-server architecture:

| Component | Stack / Technologies | Architectural Role |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite 5, TailwindCSS, Cytoscape.js, Lucide Icons, Recharts | Single-page application providing real-time dashboards, case graph canvas, and analyst workstation. |
| **Backend API** | Python 3.10+, FastAPI, Uvicorn ASGI, Pydantic v2, Asyncio | High-performance asynchronous API server handling ingestion, scoring, orchestration, and action execution. |
| **Persistence** | PostgreSQL, SQLAlchemy 2.0 (asyncpg), Alembic, In-Memory Fallback | Relational persistence for transactions, cases, graph structures, and audit events with dev fallback. |
| **Realtime Stream** | FastAPI WebSockets (`/ws`) | Low-latency bidirectional event broadcasting to connected frontend clients. |
| **Local AI Layer** | Ollama HTTP API, Qwen 3:8B (`qwen3:8b`) | Advisory-only local LLM service for evidence analysis without external cloud API dependencies. |
| **Policy Engine** | Python (`app/engines/autonomous_policy_engine.py`) | Fail-closed deterministic decision engine mapping risk scores to allowable system actions. |
| **Action Executor** | Python (`app/services/simulated_action_executor.py`) | Idempotent execution layer mutating account states and writing 21-field audit events. |

---

## 📁 Monorepo Directory Structure

```
SENTINEL/
├── backend/                            # FastAPI Backend Service
│   ├── alembic/                        # PostgreSQL Schema Migrations
│   │   ├── versions/                   # Migration script versions
│   │   └── env.py                      # Alembic migration environment
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py               # Risk weights & scoring thresholds
│   │   │   ├── constants.py            # System enums & status codes
│   │   │   └── data_store.py           # Thread-safe in-memory store fallback
│   │   ├── db/
│   │   │   ├── config.py               # Database URL resolution
│   │   │   └── session.py              # Async SQLAlchemy engine & session dependency
│   │   ├── engines/
│   │   │   ├── autonomous_policy_engine.py # Deterministic safety & policy rules
│   │   │   ├── case_manager.py         # Case creation & transaction linking
│   │   │   ├── graph_engine.py         # Multi-hop graph building & traversal
│   │   │   ├── recovery_engine.py      # Fund recovery tracking
│   │   │   ├── response_policy_engine.py   # Response policy evaluation
│   │   │   └── scoring_engine.py       # Hybrid rule + ML scoring calculation
│   │   ├── models/
│   │   │   └── sql_models.py           # SQLAlchemy ORM database models
│   │   ├── repositories/
│   │   │   └── case_repository.py      # PostgreSQL & In-Memory repository pattern
│   │   ├── routes/
│   │   │   └── intelligence.py         # Qwen AI advisory endpoints
│   │   ├── services/
│   │   │   ├── analyst_agent.py        # Stage 5: Decision Support Agent
│   │   │   ├── audit_explanation_agent.py # Stage 4: Audit Explanation Agent
│   │   │   ├── automation_executor.py  # Automation pipeline executor
│   │   │   ├── case_lifecycle_agent.py # Case lifecycle state management
│   │   │   ├── contextual_agent.py     # Stage 2: Contextual Agent
│   │   │   ├── evidence_agent.py       # Stage 1: Evidence Agent
│   │   │   ├── investigation_orchestrator.py # 5-Stage pipeline orchestrator
│   │   │   ├── ml_risk_engine.py       # ML feature contribution engine
│   │   │   ├── mock_apis.py            # Simulated agency APIs (Bank/Telecom/Police)
│   │   │   ├── ollama_service.py       # Local Ollama Qwen 3:8B integration
│   │   │   ├── orchestrator.py         # Transaction ingestion pipeline
│   │   │   ├── reasoning_engine.py     # Rule reasoning engine
│   │   │   ├── regulatory_agent.py     # Stage 3: Regulatory Compliance Agent
│   │   │   └── simulated_action_executor.py # Idempotent action execution layer
│   │   └── utils/
│   │       └── id_generator.py         # Canonical ID generator
│   ├── simulator/
│   │   └── simulator.py                # Transaction stream & fraud scenario generator
│   ├── tests/                          # Comprehensive pytest test suite (36 files)
│   ├── alembic.ini                     # Alembic configuration
│   ├── main.py                         # Primary FastAPI application entrypoint
│   └── requirements.txt                # Python backend dependencies
│
├── frontend/                           # React + Vite Frontend Application
│   ├── src/
│   │   ├── components/                 # UI components
│   │   │   ├── ActionButton.jsx        # Standard action trigger button
│   │   │   ├── ActionTakenToast.jsx    # Action confirmation notification
│   │   │   ├── AnalystEvidenceViewer.jsx # Evidence inspection component
│   │   │   ├── AttackModeToggle.jsx    # Scenario injection toggle
│   │   │   ├── AutomateModeToggle.jsx   # Global Automation ON/OFF control
│   │   │   ├── AutomationAuditDrawer.jsx # Slide-over audit drawer
│   │   │   ├── CaseCard.jsx            # Case summary card
│   │   │   ├── ErrorBoundary.jsx       # React component error boundary
│   │   │   ├── FactorBreakdown.jsx     # Risk factor contribution chart
│   │   │   ├── GoldenTimer.jsx         # Golden window countdown timer
│   │   │   ├── InvestigationSidebar.jsx# Workstation investigation sidebar
│   │   │   ├── LiveAlertToast.jsx      # High-risk alert toast
│   │   │   ├── Login.jsx               # Analyst authentication modal
│   │   │   ├── RiskBadge.jsx           # Color-coded risk status badge
│   │   │   └── SystemStatusBar.jsx     # WebSocket & system status indicator
│   │   ├── hooks/
│   │   │   └── useWebSocket.js         # Realtime WebSocket subscription hook
│   │   ├── modules/
│   │   │   └── GraphModule/            # Multi-hop graph visualization package
│   │   │       ├── ActionLog.jsx       # Graph action timeline
│   │   │       ├── ActionPanel.jsx     # Graph action control panel
│   │   │       ├── AgentReportModal.jsx# 5-Stage report viewing modal
│   │   │       ├── EntityDetailModal.jsx # Account entity deep-dive modal
│   │   │       ├── GraphCanvas.jsx     # Cytoscape.js interactive canvas
│   │   │       ├── GraphModule.jsx     # Main graph module layout
│   │   │       ├── InvestigationBriefModal.jsx # Case investigation brief modal
│   │   │       ├── Legend.jsx          # Node/edge legend component
│   │   │       ├── NodeActions.jsx     # Per-node action menu
│   │   │       ├── RecoveryBar.jsx     # Financial recovery progress bar
│   │   │       ├── TransactionDetailModal.jsx # Transaction details modal
│   │   │       └── TransactionInspectorModal.jsx # Deep-dive inspector modal
│   │   ├── pages/
│   │   │   ├── Cases.jsx               # Case Queue management page
│   │   │   ├── Dashboard.jsx           # Primary Analyst Workstation page
│   │   │   ├── Feed.jsx                # Transaction stream feed page
│   │   │   └── Graph.jsx               # Standalone Graph page
│   │   ├── services/
│   │   │   └── exportAuditLog.js       # Client-side audit log helper
│   │   ├── roleStore.js                # Role-based access control state
│   │   ├── App.jsx                     # Root application component & router
│   │   ├── main.jsx                    # React entrypoint
│   │   └── index.css                   # Global styles & Tailwind import
│   ├── package.json                    # Node.js dependencies & scripts
│   └── vite.config.js                  # Vite build configuration
│
└── README.md                           # Comprehensive System Documentation
```

---

## 🔬 Investigation Pipeline (5-Stage)

SENTINEL features an automated 5-stage agent investigation pipeline orchestrated by `investigation_orchestrator.py`. When triggered, the pipeline executes sequentially across five domain-specific agents:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    5-STAGE INVESTIGATION PIPELINE                        │
└─────────────────────────────────────────────────────────────────────────┘
   │
   ├──► [Stage 1: EVIDENCE] (evidence_agent.py)
   │    • Extracts transaction metadata, channel, amount, and velocity flags.
   │    • Identifies initial risk signals and anomalies.
   │
   ├──► [Stage 2: CONTEXTUAL] (contextual_agent.py)
   │    • Aggregates account historical baselines and profile age.
   │    • Analyzes multi-hop graph topology and connected entity nodes.
   │
   ├──► [Stage 3: REGULATORY] (regulatory_agent.py)
   │    • Evaluates AML/CFT statutory thresholds (e.g. ₹50K / ₹100K limits).
   │    • Assesses Suspicious Transaction Report (STR/SAR) filing requirements.
   │
   ├──► [Stage 4: AUDIT_EXPLANATION] (audit_explanation_agent.py)
   │    • Generates step-by-step reasoning and evidence traceability.
   │    • Prepares compliance-ready audit documentation.
   │
   └──► [Stage 5: DECISION_SUPPORT] (analyst_agent.py)
        • Synthesizes findings into an executive recommendation brief.
        • Formulates suggested disposition and follow-up steps.
```

### Pipeline Features & Persistence

- **State Tracking**: Each stage transitions through `PENDING` → `IN_PROGRESS` → `COMPLETED` (or `FAILED`).
- **Progressive Frontend Visibility**: Realtime WebSocket events broadcast stage completion, updating the workstation's 5-stage timeline dynamically.
- **Persistent Investigation Runs**: Each run is assigned a unique `run_id` and saved in the case store or PostgreSQL database.
- **Report Package Retrieval**: Full structured reports are retrievable per stage or as a complete bundle.

### Implemented Pipeline API Endpoints

- `POST /cases/{case_id}/investigate` — Trigger a new 5-stage investigation run for a case.
- `GET /cases/{case_id}/investigation` — Retrieve the latest investigation state and read model.
- `GET /cases/{case_id}/investigation-runs` — List all historical investigation runs for a case.
- `GET /cases/{case_id}/investigation-runs/{run_id}` — Retrieve details of a specific investigation run.
- `GET /cases/{case_id}/reports/{report_type}` — Retrieve a specific stage report (`EVIDENCE`, `CONTEXTUAL`, `REGULATORY`, `AUDIT_EXPLANATION`, `DECISION_SUPPORT`).
- `GET /cases/{case_id}/evidence` — Fetch raw evidence package for a case.
- `GET /cases/{case_id}/regulatory-assessment` — Fetch regulatory assessment report.
- `GET /cases/{case_id}/audit-explanation` — Fetch audit explanation report.
- `GET /cases/{case_id}/decision-support` — Fetch decision support report.

---

## 🕸️ Multi-Hop Network Investigation

SENTINEL's graph engine (`graph_engine.py`) models financial transactions as directed graphs, identifying complex laundering patterns across multiple account hops.

### Graph Data Schema

Each edge and node in the graph contains canonical multi-hop metadata:

- `chain_id`: Unique identifier linking all transactions in a money flow sequence.
- `hop_number`: Step index of a transaction within the chain (e.g. Hop 1, Hop 2, Hop 3).
- `total_hops`: Total number of hops in the detected chain.
- `pattern_type`: Topology classification code.
- `parent_transaction_id`: ID of the immediately preceding transaction in the sequence.
- `root_transaction_id`: ID of the initial originating transaction.
- **Node Account Types**: `SOURCE` (Victim), `MULE` (Intermediary layer), `INTERMEDIARY`, `DESTINATION`, `CASHOUT`, `CRYPTO`, `MERCHANT`.

### Implemented Multi-Hop Simulation Scenarios

Investigators can inject deterministic multi-hop scenarios via `POST /simulate/multi_hop_scenario/{scenario_id}`:

| Scenario ID | Name | Hops | Topology Pattern | Description |
| :--- | :--- | :---: | :--- | :--- |
| `scenario-1` | Normal Payment | 1 | `NORMAL_PAYMENT` | Direct 1-hop peer-to-merchant transaction with low risk score (15). |
| `scenario-2` | 3-Hop Transfer | 3 | `3_HOP_TRANSFER` | Sequential transfer through 2 intermediary accounts with escalating risk. |
| `scenario-3` | 5-Hop Mule Chain | 4 | `MULE_CHAIN` | Multi-layer mule network across SWIFT/NEFT channels triggering Critical `FREEZE` policy. |
| `scenario-4` | Funnel Account | 2 | `FUNNEL_ACCOUNT` | Multiple victim accounts sending funds into a single central funnel account (`ACC-FUNNEL-9900`). |
| `scenario-5` | Fan-Out Distribution | 1 | `FAN_OUT` | Single source account rapidly disbursing funds into multiple distinct receiver accounts. |
| `scenario-6` | Circular Flow | 4 | `CIRCULAR_FLOW` | High-risk looping sequence returning funds to the originating account (`A -> B -> C -> D -> A`). |
| *Network Metric* | Shared Intermediary | N/A | `SHARED_INTERMEDIARY` | Detection of an intermediary account shared across multiple distinct cases. |

---

## 🖥️ Analyst Investigation Workstation

The SENTINEL UI is built around an integrated investigation workstation (`Dashboard.jsx`, `GraphModule.jsx`):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ SENTINEL ANALYST WORKSTATION                                                           │
├───────────────────────────────────────────────────┬────────────────────────────────────┤
│ INTERACTIVE CASE GRAPH CANVAS (Cytoscape.js)       │ INVESTIGATION SIDEBAR              │
│ • Color-coded nodes (Active, Frozen, Blocked)     │ • Single "Analyze" Trigger         │
│ • Directed flow edges with amount labels           │ • 5-Stage AML Timeline             │
│ • Path highlighting & lead node identification    │ • Golden Window Countdown          │
│ • Node selection context menu                     │ • Recovery Progress Bar            │
├───────────────────────────────────────────────────┴────────────────────────────────────┤
│ DEEP-DIVE MODALS                                                                       │
│ ├─ Transaction Inspector Modal (Flow, risk breakdown, channel metadata)                │
│ ├─ Investigation Brief Modal (Executive summary, topological assessment)               │
│ ├─ Agent Reports Modal (Tabbed 5-stage report inspection)                              │
│ └─ Entity Detail Modal (Account balance, monitoring state, connected transactions)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Workstation Capabilities

- **Single "Analyze" Entry Point**: Triggers both the 5-stage agent pipeline and Qwen advisory AI with one click.
- **Interactive Case Graph**: Real-time rendering via Cytoscape.js with visual path highlighting, node status updates, and edge detail triggers.
- **Transaction Inspection**: Complete audit of transaction channels, risk factor breakdowns, and parent/root transaction lineage.
- **Agent Report Viewing**: Tabbed modal displaying detailed outputs from all 5 investigation agents.
- **Entity Deep-Dive**: Inspection of account profiles, current state (`ACTIVE`, `FROZEN`, `BLOCKED`, `CLOSED`), and total transaction volume.
- **Financial Recovery Tracking**: Real-time progress bar computing recoverable vs withdrawn balances across case accounts.

---

## 🤖 Local AI / QWEN Advisory Intelligence

SENTINEL integrates a local, privacy-preserving advisory AI powered by **Qwen 3:8B** running via **Ollama** (`ollama_service.py`, `routes/intelligence.py`).

### Architectural Boundary & Governance

> [!IMPORTANT]
> **Strict Advisory Boundary**: Qwen 3:8B functions strictly as an advisory assistant to human analysts. It has **NO authorization authority**, cannot invoke action execution, and cannot override deterministic policy decisions.

```mermaid
graph LR
    AI["AI RECOMMENDATION<br/>(Qwen 3:8B / Ollama)"] -->|Advisory Brief Only| WORKSTATION["ANALYST WORKSTATION<br/>(Human Review)"]
    POLICY["DETERMINISTIC POLICY ENGINE<br/>(autonomous_policy_engine.py)"] -->|Policy Decision| EXECUTOR["ACTION EXECUTOR<br/>(simulated_action_executor.py)"]
    
    style AI fill:#f9f,stroke:#333,stroke-width:2px
    style POLICY fill:#bbf,stroke:#333,stroke-width:2px
```

### Structured Intelligence Schema (`IntelligenceResult`)

Qwen returns a strictly formatted JSON response object:

```json
{
  "status": "ready",
  "provider": "ollama",
  "model": "qwen3:8b",
  "case_id": "CASE-ABC12345",
  "generated_at": "2026-09-03T12:00:00Z",
  "analysis": {
    "summary": "Multi-hop mule chain layering detected involving 4 intermediate accounts.",
    "risk_explanation": "Transaction amount exceeds 4.2x monthly baseline combined with off-hours timing and a new receiver.",
    "patterns": [
      {
        "name": "Mule Chain Layering",
        "evidence": "Rapid transfer across ACC-MULE-4821 and ACC-INT-7732 within 45 seconds.",
        "confidence": 0.92
      }
    ],
    "network_explanation": "Funds originated from ACC-USR-1023, passed through 2 mule accounts, and targeted exit merchant ACC-MERCH-4412.",
    "key_entities": ["ACC-USR-1023", "ACC-MULE-4821", "ACC-MERCH-4412"],
    "recommended_investigation_steps": [
      "Verify KYC documents for ACC-MULE-4821.",
      "Inspect IP address logs for device takeover indicators."
    ],
    "ai_confidence": 0.88
  },
  "actor": "AI_ASSISTANT",
  "purpose": "INVESTIGATION_INTELLIGENCE"
}
```

### Health States & Error Handling

- **`ready`**: Successful analysis returned from Qwen.
- **`unavailable`**: Ollama HTTP service not reachable at `OLLAMA_BASE_URL`.
- **`timeout`**: Model execution exceeded `OLLAMA_TIMEOUT` (default: 60s).
- **`error`**: Exception during model invocation or parsing.
- **`no_data`**: Case ID not found or context insufficient.

---

## ⚡ Autonomous Action & Deterministic Policy Engine

SENTINEL enforces safety rules via a deterministic policy engine (`autonomous_policy_engine.py`). Decisions are based strictly on risk scores, risk levels, case status, and automation mode state:

### Policy Threshold Mapping

| Risk Score Range | Risk Level | Default Policy Action | Policy Rule ID | Execution Mode |
| :--- | :--- | :--- | :--- | :--- |
| **0 – 39** | `LOW` | `MONITOR` | `POL-MONITOR-001` | Autonomous / Manual |
| **40 – 69** | `MEDIUM` | `ENHANCED_MONITORING` | `POL-MEDIUM-001` | Autonomous / Manual |
| **70 – 84** | `HIGH` | `ESCALATE_ANALYST_REVIEW` | `POL-HIGH-001` | Autonomous / Manual |
| **≥ 85** | `CRITICAL` | `FREEZE` / `BLOCK` / `CLOSE` | `POL-CRITICAL-001` | **Human Operator Approval Required for FREEZE** |

### Policy Fail-Closed Validation Rules

1. **Rule 1 (Invalid Payload)**: Missing or malformed transaction payload returns `REJECT` (`POL-ERR-NO-TX`).
2. **Rule 2 (Missing Score)**: Missing or non-numeric risk score returns `REJECT` (`POL-ERR-NO-SCORE`).
3. **Rule 3 (Invalid Risk Level)**: Unrecognized risk level string returns `REJECT` (`POL-ERR-INVALID-LEVEL`).
4. **Rule 4 (Unsupported Action)**: Unknown action code returns `REJECT` (`POL-ERR-UNKNOWN-ACTION`).
5. **Rule 5 (Closed Case State)**: Transactions on closed cases return `REJECT` (`POL-ERR-INVALID-CASE-STATE`).
6. **Rule 6 (Automation OFF)**: Autonomous non-freeze actions when Automation Mode is OFF return `DO_NOT_EXECUTE` (`POL-MODE-OFF`).
7. **Rule 7 (Idempotency Key)**: Deterministic idempotency key (`AUTO-ACTION:{case_id}:{tx_id}:{policy_rule_id}`) prevents duplicate execution.

---

## 🔒 Freeze & Human Approval Boundary

> [!CAUTION]
> **Non-Negotiable Freeze Policy**: `FREEZE` actions carry high operational and legal impact. Therefore, **`FREEZE` is ALWAYS operator-controlled** and will **NEVER be autonomously executed**, even when Automation Mode is toggled ON.

### Freeze Boundary Specifications

- **Policy Status**: When policy evaluates a `CRITICAL` transaction for `FREEZE`, the policy engine outputs `decision_status = REQUIRES_OPERATOR_ACTION`.
- **UI Exposure**: Qualifying high-risk transactions expose a prominent "Freeze Account" control button in the workstation.
- **Operator Confirmation**: Frontend forces an explicit confirmation modal before sending the request.
- **Authoritative Backend Execution**: Freeze logic is enforced strictly by the backend (`POST /action/freeze` or `POST /transactions/{transaction_id}/freeze`).
- **State Synchronization**: On operator confirmation, account state transitions from `ACTIVE` → `FROZEN`, locking downstream nodes in graph memory and PostgreSQL.
- **Audit Attribution**: Audit event explicitly records `actor_type = HUMAN_OPERATOR` along with the analyst ID.
- **Client Non-Authority**: Frontend client cannot force an account into `FROZEN` state arbitrarily; backend validates all state mutations.
- **Failure Transparency**: Execution failures are rendered inline to the operator rather than displaying a misleading success notification.

---

## 🤖 Automation Mode

Global system behavior is governed by the Automation Mode setting:

### Mode Indicator States

- **Automation OFF (Manual Mode)**:
  - Header Banner: `"○ AUTOMATION OFF · MANUAL ACTION MODE"`
  - Behavior: System scores transactions and creates cases, but requires analyst interaction for all actions. Autonomous policy actions evaluate to `DO_NOT_EXECUTE`.
- **Automation ON (Autonomous Mode)**:
  - Header Banner: `"● AUTOMATION ACTIVE · AUTONOMOUS ACTION MODE"`
  - Persistent Indicator: `"AUTONOMOUS ACTIONS: ACTIVE | FREEZE: OPERATOR APPROVAL REQUIRED"`
  - Behavior: System autonomously executes permitted actions (`ENHANCED_MONITORING`, `ESCALATE_ANALYST_REVIEW`, `BLOCK`, `FILE_STR`, `CLOSE_ACCOUNT`) while keeping `FREEZE` strictly under human operator control.

---

## 🛠️ Implemented Actions Catalog

SENTINEL implements 9 distinct investigative and enforcement actions across backend services (`simulated_action_executor.py`):

| Action Code | Target | Execution Authority | Resulting Account State | Description |
| :--- | :--- | :--- | :--- | :--- |
| `MONITOR` | Account | Autonomous / Manual | `MONITORING` | Places account under standard surveillance logging. |
| `ENHANCED_MONITORING` | Account | Autonomous / Manual | `ENHANCED_MONITORING` | Activates high-frequency monitoring and velocity checks. |
| `ESCALATE_ANALYST_REVIEW` | Case | Autonomous / Manual | `ESCALATED` | Escalates case to priority queue for urgent analyst review. |
| `BLOCK` | Account / Tx | Autonomous / Manual | `BLOCKED` | Blocks account and prevents future transaction processing. |
| `REJECT_TRANSACTION` | Transaction | Autonomous / Manual | `REJECTED` | Rejects specific pending transaction attempt. |
| `FILE_STR` | Case / Tx | Autonomous / Manual | `STR_FILED` | Files a formal Suspicious Transaction Report (STR/SAR). |
| `CLOSE_ACCOUNT` | Account | Autonomous / Manual | `CLOSED` | Permanently closes fraudulent account. |
| `CLOSE_FP` | Case | Manual Analyst Only | `CLOSED_FALSE_POSITIVE` | Closes investigation as a confirmed false positive. |
| `FREEZE` | Account | **Human Operator Only** | `FROZEN` | Freezes account and locks available funds. |

---

## 📜 Audit System & CSV Export

SENTINEL maintains a 21-field internal audit event record for complete regulatory compliance and traceability.

### 16 Canonical Export Fields

The CSV audit export endpoint (`GET /export/sentinel_audit.csv`) streams complete audit logs with 16 canonical columns:

1. `Timestamp` — ISO-8601 UTC timestamp.
2. `Audit ID` — Immutable audit record identifier (`AUD-HUMA-...` or `AUD-SYST-...`).
3. `Case ID` — Associated case ID (`CASE-...`).
4. `Transaction ID` — Primary transaction ID (`TX-...`).
5. `Account ID` — Target account identifier (`ACC-...`).
6. `Risk Score` — Final transaction risk score (0–100).
7. `Risk Level` — Risk classification (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
8. `Action` — Action code executed (`FREEZE`, `BLOCK`, `STR_FILED`, etc.).
9. `Execution Mode` — `AUTOMATE_ON` or `AUTOMATE_OFF`.
10. `Actor` — `HUMAN_OPERATOR` or `SYSTEM_AUTOMATION`.
11. `Action Status` — `SUCCESS`, `NOT_EXECUTED`, `REJECTED`, or `FAILED`.
12. `Previous State` — Pre-execution account status (`ACTIVE`).
13. `Resulting State` — Post-execution account status (`FROZEN`, `BLOCKED`, etc.).
14. `Reason` — Detailed execution rationale and policy rule trigger.
15. `Policy Rule ID` — Policy rule identifier (`POL-CRITICAL-001`, etc.).
16. `Operator / Analyst ID` — Identifier of human operator or system service.

> [!NOTE]
> **Excel Compatibility**: CSV export streams include a native **UTF-8 Byte Order Mark (BOM: `\ufeff`)** at the beginning of the file, ensuring Microsoft Excel correctly parses UTF-8 encoding and column headers without manual import configuration.

---

## 📊 Case Queue & Lifecycle Management

Cases transition through defined lifecycle states in the Analyst Workstation (`Cases.jsx`):

### Queue Filter Tabs

- **`ALL`**: Displays all active and historical cases.
- **`NEW`**: Filter for newly created cases requiring initial review.
- **`HIGH RISK`**: Filter for cases with risk scores ≥ 70.
- **`ACTIONED`**: Filter for cases with completed manual or autonomous actions.
- **`CLOSED`**: Filter for resolved cases.

### Case Status Display Mapping

- `NEW` → **New Case**
- `HIGH_RISK` → **High Risk**
- `ACTIONED` → **Actioned**
- `MONITORING` → **Monitoring**
- `CLOSED` / `CLOSED_CONFIRMED_FRAUD` → **Closed (Confirmed Fraud)**
- `CLOSED_FP` / `CLOSED_FALSE_POSITIVE` → **Closed (False Positive)**

---

## 📡 Realtime Event Bus & WebSockets

SENTINEL broadcasts real-time updates over WebSocket connections (`ws://localhost:8000/ws`):

### Broadcasted WebSocket Events

- `tx_scored`: Fired immediately when a transaction is scored by the ingestion engine.
- `case_updated`: Fired when a case graph, risk level, or total fraud amount is updated.
- `action_taken`: Fired when a manual or autonomous action is executed.
- `automation_mode_changed`: Fired when global Automation Mode is toggled.
- `investigation_stage_updated`: Fired when an agent stage in the 5-stage pipeline completes.
- `investigation_completed`: Fired when all 5 investigation pipeline stages complete.

---

## 🧪 Testing & Build Validation

### Current Backend Test Suite Metrics

- **Total Collected Test Items**: **354 test cases** across 36 test files in `backend/tests/`.
- **Unit, Agent & Policy Tests**: **195+ core tests passing** synchronously in ~1.2 seconds without external service dependencies (covering `test_analyst_agent`, `test_audit_explanation_agent`, `test_case_lifecycle_agent`, `test_contextual_agent`, `test_evidence_agent`, `test_regulatory_agent`, `test_phase16_autonomous_engine`, `test_investigation_orchestrator`).
- **Database Integration Tests**: PostgreSQL integration tests (`test_postgres_integration.py`, `test_cases_ws_csv_pg.py`, `test_async_disposition_history_api.py`, `test_session_di.py`) execute against an active PostgreSQL instance (`postgresql+asyncpg://postgres:postgres@localhost:5432/sentinel_db`).

### Current Frontend Build Status

- **Build Engine**: Vite v5.4.21
- **Transformation Status**: **2302 modules transformed cleanly with 0 errors**.
- **Bundle Production**:
  - `dist/index.html` (0.81 kB)
  - `dist/assets/index-Ug8SRrai.css` (46.16 kB)
  - `dist/assets/index-CYyx282u.js` (1,269.90 kB)

---

## 🛡️ Security & Governance Principles

1. **Deterministic Policy Authority**: Policy rules override LLM recommendations under all circumstances.
2. **Advisory-Only AI Role**: Qwen 3:8B output cannot directly trigger account mutations or external calls.
3. **Human Control for Freeze Actions**: Account freezing requires explicit human operator confirmation.
4. **Fail-Closed API Handlers**: Missing scores, invalid payloads, or unknown action codes trigger automatic rejection.
5. **Multi-Process Idempotency**: Execution layer guarantees idempotent action processing.
6. **Authoritative Backend State**: Frontend state cannot bypass server-side validation.
7. **Complete Audit Traceability**: Immutable 21-field audit logging for every decision and execution.

---

## 🎨 Google Stitch UI Development

The Analyst Investigation Workstation user interfaces, Cytoscape graph canvas layouts, transaction inspection modals, and multi-stage investigation timelines were designed and refined using **Google Stitch MCP**.

---

## 📈 Current Implementation Status

### COMPLETED Functionality ✅

- Real-time transaction ingestion & hybrid rule + ML scoring.
- Automated 5-stage agent investigation pipeline (`EVIDENCE`, `CONTEXTUAL`, `REGULATORY`, `AUDIT_EXPLANATION`, `DECISION_SUPPORT`).
- Multi-hop graph engine withCytoscape.js rendering & 6 deterministic scenario generators.
- Local Qwen 3:8B Ollama integration returning structured advisory intelligence.
- Deterministic autonomous policy engine with fail-closed validation rules.
- Idempotent action execution layer for 9 supported actions.
- Non-negotiable human approval boundary for `FREEZE` actions.
- Global Automation Mode toggle with header/footer status indicators.
- 21-field audit logging system with UTF-8 BOM CSV export.
- Realtime WebSocket event broadcasting.
- Case Queue management with 5 filtering tabs.
- Async SQLAlchemy PostgreSQL database integration with Alembic migrations & in-memory dev fallback.

### NEXT / PLANNED Work 🔮

- Production deployment setup with Kubernetes manifests and Nginx reverse proxy.
- Real-time streaming integration with Apache Kafka / Redpanda transaction topics.
- Multi-tenant role-based access control (RBAC) with SAML/OIDC single sign-on.
- Advanced graph neural network (GNN) model integration for automated community detection.

---

## 🔑 Environment Variables

The system uses the following environment variables (configured in `.env` or system environment):

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/sentinel_db` | PostgreSQL connection string with asyncpg driver. |
| `SENTINEL_MODE` | `development` | System environment mode (`development` or `production`). |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Base URL for local Ollama HTTP API service. |
| `OLLAMA_MODEL` | `qwen3:8b` | Ollama model identifier for advisory AI. |
| `OLLAMA_TIMEOUT` | `60` | HTTP timeout in seconds for Ollama API calls. |

---

## 🚀 Getting Started & Running

### Prerequisites

- **Python 3.10+** (Backend)
- **Node.js 18+** & `npm` (Frontend)
- **Ollama** with `qwen3:8b` model pulled (Optional for AI Advisory feature)
- **PostgreSQL 14+** (Optional for PostgreSQL persistence mode)

---

### Step 1: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

### Step 2: PostgreSQL Database Setup (Optional)

If running with PostgreSQL persistence:

```bash
# Configure DATABASE_URL in environment or .env
export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/sentinel_db"

# Run Alembic migrations
alembic upgrade head
```

---

### Step 3: Local Ollama AI Setup (Optional)

```bash
# Start Ollama service
ollama serve

# Pull Qwen 3:8B model
ollama pull qwen3:8b
```

---

### Step 4: Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install Node modules
npm install
```

---

### Step 5: Running the System

Open **3 terminal windows**:

#### Terminal 1: Backend API Server
```bash
cd backend
python main.py
```
*Backend starts on `http://localhost:8000`*

#### Terminal 2: Frontend Dev Server
```bash
cd frontend
npm run dev
```
*Frontend starts on `http://localhost:5173`*

#### Terminal 3: Transaction Stream Simulator
```bash
cd backend
python simulator/simulator.py
```
*Simulator starts streaming transactions to backend*

---

### Step 6: Running Tests & Build Verification

```bash
# Run backend unit & agent tests
cd backend
python -m pytest tests/test_phase16_autonomous_engine.py tests/test_analyst_agent.py tests/test_audit_explanation_agent.py tests/test_case_lifecycle_agent.py tests/test_contextual_agent.py tests/test_evidence_agent.py tests/test_regulatory_agent.py tests/test_investigation_orchestrator.py

# Build frontend production bundle
cd frontend
npm run build
```

---

**SENTINEL — Financial Crime & Fraud Intelligence Platform**  
*Built for speed, transparency, deterministic policy governance, and investigative effectiveness.*
