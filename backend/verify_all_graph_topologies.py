import urllib.request
import json
import uuid

API = "http://127.0.0.1:8000"

def get_json(url):
    req = urllib.request.urlopen(url)
    return json.loads(req.read())

def post_json(url, data=None):
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'} if body else {}, method='POST')
    res = urllib.request.urlopen(req)
    return json.loads(res.read())

print("=================== STARTING GRAPH TOPOLOGY VALIDATION ===================")

# 1. Trigger Attack Mode to create a genuine 5-hop / 6-node chain
print("\n--- Testing Multi-Hop Chain (Attack Mode) ---")
att_res = post_json(f"{API}/attack-mode")
cid = att_res["case_id"]
print(f"Created attack case {cid}")

case_data = get_json(f"{API}/cases/{cid}")
tx_ids = [t['tx_id'] for t in case_data.get('transactions', [])]
print(f"Transactions in chain: {tx_ids}")

# Check graph of intermediate hop (Hop 3)
hop3_tx = tx_ids[2]
g_hop3 = get_json(f"{API}/transactions/{hop3_tx}/graph")
print(f"Hop 3 ({hop3_tx}) Graph:")
print(f"  Nodes ({len(g_hop3['nodes'])}): {[n['id'] for n in g_hop3['nodes']]}")
print(f"  Edges ({len(g_hop3['edges'])}): {[(e['from'], '->', e['to']) for e in g_hop3['edges']]}")
print(f"  Topology: {g_hop3['topology_type']}")
assert len(g_hop3['nodes']) == 6, f"Expected 6 nodes, got {len(g_hop3['nodes'])}"
assert len(g_hop3['edges']) == 5, f"Expected 5 edges, got {len(g_hop3['edges'])}"
print("  [PASS]: Multi-hop attack chain correctly preserves all 6 nodes and 5 edges!")

# 2. Test Direct 2-Node Transaction
print("\n--- Testing Direct 2-Node Transaction ---")
cases = get_json(f"{API}/cases")
direct_case = next((c for c in cases if len(c.get('nodes', [])) == 2 and not c['case_id'].startswith('CASE-ATTACK')), None)

if direct_case:
    dtx = direct_case['transactions'][0]
    dtx_id = dtx['tx_id']
    g_direct = get_json(f"{API}/transactions/{dtx_id}/graph")
    print(f"Direct Tx ({dtx_id}) Graph:")
    print(f"  Nodes ({len(g_direct['nodes'])}): {[n['id'] for n in g_direct['nodes']]}")
    print(f"  Edges ({len(g_direct['edges'])}): {[(e['from'], '->', e['to']) for e in g_direct['edges']]}")
    print(f"  Topology: {g_direct['topology_type']}")
    assert len(g_direct['nodes']) == 2, f"Expected 2 nodes, got {len(g_direct['nodes'])}"
    assert len(g_direct['edges']) == 1, f"Expected 1 edge, got {len(g_direct['edges'])}"
    assert g_direct['topology_type'] == "DIRECT_TRANSFER", f"Expected DIRECT_TRANSFER, got {g_direct['topology_type']}"
    print("  [PASS]: Direct transaction renders exactly 2 nodes, 1 edge with DIRECT_TRANSFER!")

# 3. Test Sequential Differentiation (Different transactions -> Visibly different graphs)
print("\n--- Testing Sequential Differentiation ---")
if direct_case and len(tx_ids) > 0:
    node_set_1 = set(n['id'] for n in g_direct['nodes'])
    node_set_2 = set(n['id'] for n in g_hop3['nodes'])
    assert node_set_1 != node_set_2, "Graphs should have distinct node sets"
    assert len(g_direct['nodes']) != len(g_hop3['nodes']), "Graph sizes should differ"
    print(f"  Tx 1 (Direct): {len(g_direct['nodes'])} nodes -> {node_set_1}")
    print(f"  Tx 2 (Multi-hop): {len(g_hop3['nodes'])} nodes -> {node_set_2}")
    print("  [PASS]: Different transactions produce completely different topologies and node sets!")

print("\n=================== ALL TOPOLOGY VALIDATIONS PASSED ===================")
