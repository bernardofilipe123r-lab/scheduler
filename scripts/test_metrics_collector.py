"""Collect metrics for ALL brands to populate PostPerformance."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db_connection import SessionLocal
from app.models.brands import Brand

db = SessionLocal()
try:
    brands = db.query(Brand).filter(Brand.active == True).all()
    
    print("--- Running MetricsCollector for ALL brands ---")
    from app.services.analytics.metrics_collector import MetricsCollector
    collector = MetricsCollector()
    
    total = 0
    for b in brands:
        if b.id not in collector._brand_tokens:
            continue
        print(f"\n=== {b.id} ===")
        result = collector.collect_for_brand(b.id, user_id=b.user_id)
        updated = result.get("updated", 0) if isinstance(result, dict) else 0
        total += updated
        print(f"  -> {result}")
    
    from app.models import PostPerformance
    count = db.query(PostPerformance).count()
    print(f"\n\nTotal PostPerformance rows: {count}")
    print(f"Total updated this run: {total}")
    
finally:
    db.close()
