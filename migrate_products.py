"""
Migration: Add category and accessory_type columns to the products table.
Existing products default to category='phone', accessory_type=NULL.
Run once: python migrate_products.py
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "pos_database.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    # Check existing columns
    cur.execute("PRAGMA table_info(products)")
    cols = {row[1] for row in cur.fetchall()}

    added = []
    if "category" not in cols:
        cur.execute("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'phone'")
        added.append("category")

    if "accessory_type" not in cols:
        cur.execute("ALTER TABLE products ADD COLUMN accessory_type TEXT")
        added.append("accessory_type")

    conn.commit()
    conn.close()

    if added:
        print(f"✅ Migration complete. Added columns: {', '.join(added)}")
    else:
        print("ℹ️  Nothing to migrate — columns already exist.")

if __name__ == "__main__":
    migrate()

