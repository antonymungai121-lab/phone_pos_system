from app.database import SessionLocal
from app import models
from app.auth import get_password_hash

# Open a direct connection to the database
db = SessionLocal()

try:
    print("⏳ Building system foundations...")

    # 1. Create the Main Branch Shop
    main_shop = models.Shop(name="Main Branch", location="Gatura")
    db.add(main_shop)
    db.commit()
    db.refresh(main_shop)
    print(f"✅ Shop created: {main_shop.name} (ID: {main_shop.id})")

    # 2. Create the First Phone Model
    phone = models.Product(brand="Tecno", model="Spark 50", price=15000)
    db.add(phone)
    db.commit()
    print(f"✅ Product created: {phone.brand} {phone.model}")

    # 3. Create the First Secure User (Locked to the Gatura Shop!)
    # We use get_password_hash so the database never sees the real password
    admin_user = models.User(
        username="admin",
        hashed_password=get_password_hash("1234"),
        shop_id=main_shop.id 
    )
    db.add(admin_user)
    db.commit()
    print(f"✅ User created: {admin_user.username} (Assigned to Shop ID: {main_shop.id})")

    print("🎉 System Setup Complete! You are ready to log in.")

except Exception as e:
    print(f"❌ Error during setup: {e}")
finally:
    db.close()