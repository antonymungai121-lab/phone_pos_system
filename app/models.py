import datetime  # <--- NEW: We imported the time engine!

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Shop(Base):
    __tablename__ = "shops"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    location = Column(String)

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String)
    model = Column(String, unique=True, index=True)
    price = Column(Integer)

class IMEIItem(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    imei_number = Column(String, unique=True, index=True)
    status = Column(String, default="Available")  
    
    # NEW: Automatically stamp the exact exact time the barcode is scanned!
    date_added = Column(DateTime, default=datetime.datetime.utcnow) 
    
    date_sold = Column(DateTime, nullable=True)

    product_id = Column(Integer, ForeignKey("products.id"))
    shop_id = Column(Integer, ForeignKey("shops.id"))

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    shop_id = Column(Integer, ForeignKey("shops.id"))