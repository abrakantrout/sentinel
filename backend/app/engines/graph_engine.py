def get_graph(case_id: str, store: dict) -> dict:
    if "graphs" not in store:
        store["graphs"] = {}
    if case_id not in store["graphs"]:
        return {"nodes": [], "edges": []}
    return store["graphs"][case_id]


def add_node(case_id: str, account: dict, store: dict):
    if "graphs" not in store:
        store["graphs"] = {}
    if case_id not in store["graphs"]:
        store["graphs"][case_id] = {"nodes": [], "edges": []}
        
    graph = store["graphs"][case_id]
    account_id = account.get("account_id") or account.get("accountId") or account.get("id")
    if not account_id:
        return
        
    # Infer account type if not provided
    acc_type = account.get("account_type")
    if not acc_type:
        if "MULE" in str(account_id):
            acc_type = "MULE"
        elif "INT" in str(account_id) or "FUNNEL" in str(account_id) or "SHARED" in str(account_id):
            acc_type = "INTERMEDIARY"
        elif "MERCH" in str(account_id) or "DRAIN" in str(account_id) or "EXIT" in str(account_id):
            acc_type = "DESTINATION"
        else:
            acc_type = "SOURCE"

    # Search for existing node to update or append
    for n in graph["nodes"]:
        if n.get("account_id") == account_id or n.get("accountId") == account_id:
            if account.get("status"):
                n["status"] = account["status"]
            if "current_balance_sim" in account:
                n["balance"] = float(account["current_balance_sim"])
            if acc_type:
                n["account_type"] = acc_type
            return

    graph["nodes"].append({
        "account_id": str(account_id),
        "accountId": str(account_id),
        "id": str(account_id),
        "status": account.get("status", "active"),
        "balance": float(account.get("current_balance_sim", 0.0)),
        "account_type": acc_type,
        "inbound_count": int(account.get("inbound_count", 0)),
        "outbound_count": int(account.get("outbound_count", 0)),
        "total_inbound": float(account.get("total_inbound", 0.0)),
        "total_outbound": float(account.get("total_outbound", 0.0)),
        "risk_score": float(account.get("risk_score", 0.0))
    })


def add_edge(case_id: str, from_acc: str, to_acc: str, tx_id: str, amount: float, store: dict, extra: dict = None):
    if "graphs" not in store:
        store["graphs"] = {}
    if case_id not in store["graphs"]:
        store["graphs"][case_id] = {"nodes": [], "edges": []}
        
    graph = store["graphs"][case_id]
    extra = extra or {}
    
    # Check duplicate edge
    for e in graph["edges"]:
        if e.get("tx_id") == tx_id:
            # Update edge metadata if existing
            e.update({
                "from": from_acc,
                "to": to_acc,
                "amount": float(amount),
                "hop_number": extra.get("hop_number", e.get("hop_number", 1)),
                "total_hops": extra.get("total_hops", e.get("total_hops", 1)),
                "chain_id": extra.get("chain_id", e.get("chain_id")),
                "pattern_type": extra.get("pattern_type", e.get("pattern_type")),
                "parent_transaction_id": extra.get("parent_transaction_id", e.get("parent_transaction_id")),
                "root_transaction_id": extra.get("root_transaction_id", e.get("root_transaction_id")),
                "timestamp": extra.get("timestamp", e.get("timestamp", ""))
            })
            _recalculate_node_stats(graph)
            return
        
    edge_obj = {
        "from": str(from_acc),
        "to": str(to_acc),
        "source": str(from_acc),
        "target": str(to_acc),
        "tx_id": str(tx_id),
        "amount": float(amount),
        "hop_number": int(extra.get("hop_number", 1)),
        "total_hops": int(extra.get("total_hops", 1)),
        "chain_id": extra.get("chain_id") or f"CHAIN-{tx_id[:8]}",
        "pattern_type": extra.get("pattern_type") or "STANDARD",
        "parent_transaction_id": extra.get("parent_transaction_id"),
        "root_transaction_id": extra.get("root_transaction_id") or tx_id,
        "timestamp": extra.get("timestamp", "")
    }
    graph["edges"].append(edge_obj)
    _recalculate_node_stats(graph)


def _recalculate_node_stats(graph: dict):
    """Dynamically calculates node flow metrics (inbound/outbound counts and sums) from edges."""
    stats = {}
    for node in graph.get("nodes", []):
        nid = node.get("account_id") or node.get("id")
        if nid:
            stats[nid] = {
                "inbound_count": 0,
                "outbound_count": 0,
                "total_inbound": 0.0,
                "total_outbound": 0.0
            }

    for edge in graph.get("edges", []):
        src = edge.get("from") or edge.get("source")
        tgt = edge.get("to") or edge.target if hasattr(edge, "target") else edge.get("target")
        amt = float(edge.get("amount", 0.0))
        if src in stats:
            stats[src]["outbound_count"] += 1
            stats[src]["total_outbound"] += amt
        if tgt in stats:
            stats[tgt]["inbound_count"] += 1
            stats[tgt]["total_inbound"] += amt

    for node in graph.get("nodes", []):
        nid = node.get("account_id") or node.get("id")
        if nid in stats:
            node.update(stats[nid])


DEFAULT_GRAPH_HOPS = 5
MAX_GRAPH_HOPS = 8


def build_investigation_graph(case_id: str, store: dict, max_depth: int = DEFAULT_GRAPH_HOPS) -> dict:
    """
    Dynamically builds/traverses the connected multi-hop investigation graph for a case.
    Combines chain_id metadata matching with BFS account relationship traversal.
    Enforces DEFAULT_GRAPH_HOPS (5) and MAX_GRAPH_HOPS (8).
    """
    if "graphs" not in store:
        store["graphs"] = {}

    existing_graph = store["graphs"].get(case_id, {"nodes": [], "edges": []})
    nodes_by_id = {n.get("account_id") or n.get("id"): n for n in existing_graph.get("nodes", [])}
    edges_by_tx = {e.get("tx_id"): e for e in existing_graph.get("edges", [])}

    depth_limit = min(max(1, max_depth), MAX_GRAPH_HOPS)
    all_txs = list(store.get("transactions", {}).values())
    case_obj = store.get("cases", {}).get(case_id, {})

    target_chain_ids = set()
    target_root_txs = set()
    for e in existing_graph.get("edges", []):
        if e.get("chain_id"):
            target_chain_ids.add(e.get("chain_id"))
        if e.get("root_transaction_id"):
            target_root_txs.add(e.get("root_transaction_id"))

    case_tx_ids = set(case_obj.get("transactions", []))

    # Seed seed_accounts with case chain, origin_account, and existing edge endpoints
    seed_accounts = set(case_obj.get("chain", []))
    if case_obj.get("origin_account"):
        seed_accounts.add(case_obj.get("origin_account"))
    for e in existing_graph.get("edges", []):
        if e.get("from"):
            seed_accounts.add(e.get("from"))
        if e.get("to"):
            seed_accounts.add(e.get("to"))

    visited_accounts = set(seed_accounts)
    current_frontier = set(seed_accounts)

    collected_txs = {}

    # 1. Collect transactions via chain_id / root_tx / case_id matching
    for tx in all_txs:
        tid = tx.get("tx_id")
        if not tid:
            continue
        c_id = tx.get("chain_id")
        r_id = tx.get("root_transaction_id")
        case_match = (tx.get("case_id") == case_id) or (tid in case_tx_ids)
        chain_match = (c_id and c_id in target_chain_ids)
        root_match = (r_id and r_id in target_root_txs)

        if case_match or chain_match or root_match:
            collected_txs[tid] = tx
            if c_id:
                target_chain_ids.add(c_id)
            if r_id:
                target_root_txs.add(r_id)

    # 2. Bounded BFS traversal across account connections up to depth_limit
    for _ in range(depth_limit):
        if not current_frontier:
            break
        next_frontier = set()
        for tx in all_txs:
            tid = tx.get("tx_id")
            if not tid or tid in collected_txs:
                continue
            snd = tx.get("sender_account")
            rcv = tx.get("receiver_account")
            if snd in current_frontier or rcv in current_frontier:
                collected_txs[tid] = tx
                if snd and snd not in visited_accounts:
                    next_frontier.add(snd)
                    visited_accounts.add(snd)
                if rcv and rcv not in visited_accounts:
                    next_frontier.add(rcv)
                    visited_accounts.add(rcv)
        current_frontier = next_frontier

    # 3. Assemble nodes and edges from collected_txs
    account_store = store.get("accounts", {})
    for tid, tx in collected_txs.items():
        snd = tx.get("sender_account")
        rcv = tx.get("receiver_account")
        amt = float(tx.get("amount", 0.0))

        if snd and snd not in nodes_by_id:
            acc_info = account_store.get(snd) or {"account_id": snd}
            acc_type = acc_info.get("account_type")
            if not acc_type:
                if "MULE" in str(snd):
                    acc_type = "MULE"
                elif "INT" in str(snd) or "FUNNEL" in str(snd) or "SHARED" in str(snd):
                    acc_type = "INTERMEDIARY"
                elif "MERCH" in str(snd) or "DRAIN" in str(snd) or "EXIT" in str(snd):
                    acc_type = "DESTINATION"
                else:
                    acc_type = "SOURCE"
            nodes_by_id[snd] = {
                "account_id": str(snd),
                "accountId": str(snd),
                "id": str(snd),
                "status": acc_info.get("status", "active"),
                "balance": float(acc_info.get("current_balance_sim", 0.0)),
                "account_type": acc_type,
                "inbound_count": 0,
                "outbound_count": 0,
                "total_inbound": 0.0,
                "total_outbound": 0.0,
                "risk_score": float(acc_info.get("risk_score", 0.0))
            }

        if rcv and rcv not in nodes_by_id:
            acc_info = account_store.get(rcv) or {"account_id": rcv}
            acc_type = acc_info.get("account_type")
            if not acc_type:
                if "MULE" in str(rcv):
                    acc_type = "MULE"
                elif "INT" in str(rcv) or "FUNNEL" in str(rcv) or "SHARED" in str(rcv):
                    acc_type = "INTERMEDIARY"
                elif "MERCH" in str(rcv) or "DRAIN" in str(rcv) or "EXIT" in str(rcv):
                    acc_type = "DESTINATION"
                else:
                    acc_type = "SOURCE"
            nodes_by_id[rcv] = {
                "account_id": str(rcv),
                "accountId": str(rcv),
                "id": str(rcv),
                "status": acc_info.get("status", "active"),
                "balance": float(acc_info.get("current_balance_sim", 0.0)),
                "account_type": acc_type,
                "inbound_count": 0,
                "outbound_count": 0,
                "total_inbound": 0.0,
                "total_outbound": 0.0,
                "risk_score": float(acc_info.get("risk_score", 0.0))
            }

        if tid not in edges_by_tx:
            edges_by_tx[tid] = {
                "from": str(snd),
                "to": str(rcv),
                "source": str(snd),
                "target": str(rcv),
                "tx_id": str(tid),
                "amount": amt,
                "hop_number": int(tx.get("hop_number", 1)),
                "total_hops": int(tx.get("total_hops", 1)),
                "chain_id": tx.get("chain_id") or f"CHAIN-{str(tid)[:8]}",
                "pattern_type": tx.get("pattern_type") or "STANDARD",
                "parent_transaction_id": tx.get("parent_transaction_id"),
                "root_transaction_id": tx.get("root_transaction_id") or tid,
                "timestamp": tx.get("timestamp", "")
            }

    sorted_edges = sorted(list(edges_by_tx.values()), key=lambda e: (e.get("hop_number", 1), e.get("timestamp", "")))
    final_edges = sorted_edges[:depth_limit]

    active_node_ids = set()
    for e in final_edges:
        active_node_ids.add(e.get("from"))
        active_node_ids.add(e.get("to"))

    final_nodes = [n for n in nodes_by_id.values() if (n.get("account_id") or n.get("id")) in active_node_ids]
    if not final_nodes and nodes_by_id:
        final_nodes = list(nodes_by_id.values())[:depth_limit + 1]

    graph = {"nodes": final_nodes, "edges": final_edges}
    _recalculate_node_stats(graph)

    store["graphs"][case_id] = graph
    return graph



