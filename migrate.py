"""
migrate.py — One-time schema migration for the existing pos_database.db.
Adds missing columns without dropping any data.
Safe to run multiple times (checks before altering).
"""
import sqlite3

DB_PATH = "pos_database.db"

def get_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cursor.fetchall()]

def get_tables(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return [row[0] for row in cursor.fetchall()]

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

tables = get_tables(cursor)
print(f"Tables found: {tables}")

# ── 1. Add `role` column to users ────────────────────────────────────────────
user_cols = get_columns(cursor, "users")
print(f"users columns: {user_cols}")

if "role" not in user_cols:
    cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'cashier'")
    # Make existing admin users actually admin
    cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'admin'")
    print("  ✅ Added `role` column to users. Existing 'admin' user set to role='admin'.")
else:
    print("  ℹ️  users.role already exists — skipping.")

# ── 2. Create `sales` table if it doesn't exist ───────────────────────────────
if "sales" not in tables:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sales (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            imei_item_id   INTEGER NOT NULL REFERENCES inventory(id),
            shop_id        INTEGER NOT NULL REFERENCES shops(id),
            cashier_id     INTEGER NOT NULL REFERENCES users(id),
            sale_price     NUMERIC(10, 2) NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'cash',
            sold_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("  ✅ Created `sales` table.")
else:
    print("  ℹ️  sales table already exists — skipping.")

# ── 3. Ensure product.price is stored as REAL (already fine for existing dbs) ─
prod_cols = get_columns(cursor, "products")
print(f"products columns: {prod_cols}")

if "details" not in prod_cols:
    cursor.execute("ALTER TABLE products ADD COLUMN details TEXT")
    print("  ✅ Added `details` column to products table.")
else:
    print("  ℹ️  products.details already exists — skipping.")

conn.commit()
conn.close()

print("\n🎉 Migration complete! Restart the server and try again.")
