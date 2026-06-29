"""
One-time database seeder.
Safe to run multiple times — uses upsert guards to avoid UNIQUE constraint errors.
Run: python setup.py
"""
import sys
from app.database import SessionLocal, engine, Base
from app import models
from app.auth import get_password_hash

# Create all tables
Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    print("⏳ Seeding database...")

    # 1. Create or fetch the Main Branch Shop
    main_shop = db.query(models.Shop).filter(models.Shop.name == "Main Branch").first()
    if not main_shop:
        main_shop = models.Shop(name="Main Branch", location="Gatura")
        db.add(main_shop)
        db.commit()
        db.refresh(main_shop)
        print(f"  ✅ Shop created: {main_shop.name} (ID: {main_shop.id})")
    else:
        print(f"  ℹ️  Shop already exists: {main_shop.name} (ID: {main_shop.id})")

    # 2. Create or skip the seed product
    phone = db.query(models.Product).filter(models.Product.model == "Spark 50").first()
    if not phone:
        phone = models.Product(brand="Tecno", model="Spark 50", price=15000)
        db.add(phone)
        db.commit()
        print(f"  ✅ Product created: {phone.brand} {phone.model}")
    else:
        print(f"  ℹ️  Product already exists: {phone.brand} {phone.model}")

    # 3. Create or skip the admin user
    admin_user = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin_user:
        # Prompt for a real password — no defaults in production
        import getpass
        print("\n  🔐 Set admin password (min 8 characters):")
        while True:
            password = getpass.getpass("  Password: ")
            confirm  = getpass.getpass("  Confirm:  ")
            if len(password) < 8:
                print("  ❌ Password too short. Minimum 8 characters.")
            elif password != confirm:
                print("  ❌ Passwords do not match. Try again.")
            else:
                break

        admin_user = models.User(
            username        = "admin",
            hashed_password = get_password_hash(password),
            shop_id         = main_shop.id,
            role            = "admin",
        )
        db.add(admin_user)
        db.commit()
        print(f"  ✅ Admin user created (assigned to shop ID: {main_shop.id})")
    else:
        print(f"  ℹ️  Admin user already exists — no changes made.")

    print("\n🎉 Setup complete! You can now start the server with: uvicorn main:app --reload")

except Exception as e:
    db.rollback()
    print(f"\n❌ Setup failed: {e}", file=sys.stderr)
    sys.exit(1)
finally:
    db.close()