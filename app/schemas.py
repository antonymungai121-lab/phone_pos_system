from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# --- SHOP SCHEMAS ---
class ShopCreate(BaseModel):
    name: str
    location: Optional[str] = None

class ShopResponse(ShopCreate):
    id: int
    class Config:
        from_attributes = True

# --- PRODUCT SCHEMAS ---
class ProductCreate(BaseModel):
    brand: str
    model: str
    base_price: int

class ProductResponse(ProductCreate):
    id: int
    class Config:
        from_attributes = True

# --- IMEI / INVENTORY SCHEMAS ---
class IMEICreate(BaseModel):
    # Enforce exactly 15 characters for a valid IMEI
    imei_number: str = Field(..., min_length=15, max_length=15, description="15-digit IMEI number")
    product_id: int
    shop_id: int

class IMEIResponse(BaseModel):
    id: int
    imei_number: str
    product_id: int
    shop_id: int
    status: str
    date_added: datetime
    date_sold: Optional[datetime] = None
    
    class Config:
        from_attributes = True
        
# --- POINT OF SALE SCHEMA ---
class POSCheckout(BaseModel):
    imei_number: str = Field(..., min_length=15, max_length=15)
    shop_id: int # The shop making the sale (to prevent selling another shop's stock)