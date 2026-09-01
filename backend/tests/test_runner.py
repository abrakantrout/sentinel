import sys
import os
from datetime import datetime, timezone

# Add parent directory to path to allow imports when running directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from app.core.config import settings
    from app.core.constants import CaseStatus, AccountStatus, ActionTypes
    from app.core.models import Transaction, AccountNode, Case, ActionLog
    from app.core.data_store import transactions, cases, accounts, action_logs, add_transaction, get_transaction
    from app.utils.id_generator import IDGenerator
    from app.engines.scoring_engine import score_transaction
    from app.engines.case_manager import process_scored_tx
    from app.engines.graph_engine import add_transaction_to_graph, get_case_graph
    from app.engines.recovery_engine import calculate_recovery
    
    print("All modules imported successfully.")
    
    # Basic object creation test
    tx_id = IDGenerator.generate_tx_id()
    tx = Transaction(
        tx_id=tx_id, 
        sender_account="ACC-1001", 
        receiver_account="ACC-1002", 
        amount=150.50, 
        timestamp=datetime.now(timezone.utc), 
        channel="WEB"
    )
    add_transaction(tx)
    
    retrieved_tx = get_transaction(tx_id)
    print(f"Created Test Transaction: {retrieved_tx.tx_id}")
    print("Test passed.")
    
except ImportError as e:
    print(f"Import failed: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Test failed with error: {e}")
    sys.exit(1)
