import urllib.request
import json

res = urllib.request.urlopen('http://127.0.0.1:8000/cases/CASE-ATTACK-8E6DE188')
c = json.loads(res.read())
tx_ids = [t['tx_id'] for t in c.get('transactions', [])]
print('Tx IDs:', tx_ids)

for idx, tid in enumerate(tx_ids):
    tg_res = urllib.request.urlopen(f'http://127.0.0.1:8000/transactions/{tid}/graph')
    tg = json.loads(tg_res.read())
    print(f"\nHop {idx+1} ({tid}):")
    print(f"  Nodes ({len(tg['nodes'])}): {[n['id'] for n in tg['nodes']]}")
    print(f"  Edges ({len(tg['edges'])}): {[(e['from'], '->', e['to']) for e in tg['edges']]}")
    print(f"  Topology: {tg['topology_type']}")
