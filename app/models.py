import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from app.database import Base


class Shop(Base):
    __tablename__ = "shops"

    id       = Column(Integer, primary_key=True, index=True)
    name     = Column(String, unique=True, index=True, nullable=False)
    location = Column(String)

    # Relationships
    users     = relationship("User",     back_populates="shop")
    inventory = relationship("IMEIItem", back_populates="shop")
    sales     = relationship("Sale",     back_populates="shop")


class Product(Base):
    __tablename__ = "products"

    id             = Column(Integer, primary_key=True, index=True)
    brand          = Column(String, nullable=False)
    model          = Column(String, unique=True, index=True, nullable=False)
    # Numeric(10,2) prevents floating-point rounding errors on currency
    price          = Column(Numeric(10, 2), nullable=False)
    # "phone" or "accessory"
    category       = Column(String, default="phone", nullable=False)
    # For accessories: charger | earphone | earpod | back_cover | screen_protector | other
    accessory_type = Column(String, nullable=True)

    # Relationships
    inventory = relationship("IMEIItem", back_populates="product")


class IMEIItem(Base):
    __tablename__ = "inventory"

    id          = Column(Integer, primary_key=True, index=True)
    imei_number = Column(String, unique=True, index=True, nullable=False)
    status      = Column(String, default="Available", nullable=False)  # Available | Sold
    date_added  = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    date_sold   = Column(DateTime, nullable=True)

    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    shop_id    = Column(Integer, ForeignKey("shops.id"),    nullable=False)

    # Relationships
    product = relationship("Product", back_populates="inventory")
    shop    = relationship("Shop",    back_populates="inventory")
    sale    = relationship("Sale",    back_populates="item", uselist=False)


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    shop_id         = Column(Integer, ForeignKey("shops.id"), nullable=False)
    # Role controls what the user can do: cashier | manager | admin
    role            = Column(String, default="cashier", nullable=False)

    # Relationships
    shop  = relationship("Shop", back_populates="users")
    sales = relationship("Sale", back_populates="cashier")


class Sale(Base):
    """
    Full audit record for every transaction.
    Survives even if the IMEIItem is queried later — all sale details are preserved.
    """
    __tablename__ = "sales"

    id             = Column(Integer, primary_key=True, index=True)
    imei_item_id   = Column(Integer, ForeignKey("inventory.id"), nullable=False)
    shop_id        = Column(Integer, ForeignKey("shops.id"),     nullable=False)
    cashier_id     = Column(Integer, ForeignKey("users.id"),     nullable=False)
    # Sale price at time of transaction (may differ from Product.price due to discounts)
    sale_price     = Column(Numeric(10, 2), nullable=False)
    payment_method = Column(String, default="cash", nullable=False)  # cash | mpesa | card
    sold_at        = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    item    = relationship("IMEIItem", back_populates="sale")
    shop    = relationship("Shop",     back_populates="sales")
    cashier = relationship("User",     back_populates="sales")