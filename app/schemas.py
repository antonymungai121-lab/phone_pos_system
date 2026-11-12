from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


# ── SHOP SCHEMAS ─────────────────────────────────────────────────────────────
class ShopCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=200)


class ShopResponse(ShopCreate):
    id: int

    class Config:
        from_attributes = True


# ── PRODUCT SCHEMAS ───────────────────────────────────────────────────────────
class ProductCreate(BaseModel):
    brand:          str     = Field(..., min_length=1, max_length=100)
    model:          str     = Field(..., min_length=1, max_length=100)
    price:          Decimal = Field(..., gt=0, decimal_places=2, description="Selling price in KES")
    category:       Literal["phone", "accessory"] = "phone"
    accessory_type: Optional[str] = None   # charger|earphone|earpod|back_cover|screen_protector|other


class ProductResponse(BaseModel):
    id:             int
    brand:          str
    model:          str
    price:          Decimal
    category:       str
    accessory_type: Optional[str] = None

    class Config:
        from_attributes = True


# ── IMEI / INVENTORY SCHEMAS ──────────────────────────────────────────────────
class IMEICreate(BaseModel):
    # Standard IMEI is exactly 15 digits; accessories use generated serials (no length lock)
    imei_number: str = Field(..., min_length=15, max_length=15, description="15-digit IMEI number")
    product_id: int
    shop_id: Optional[int] = None   # admin/manager may specify; cashier uses own shop


class BulkAccessoryCreate(BaseModel):
    product_id: int
    quantity:   int = Field(..., ge=1, le=500, description="Number of units to stock in (max 500 per request)")
    shop_id:    Optional[int] = None   # admin/manager may specify target branch


class IMEIResponse(BaseModel):
    id:          int
    imei_number: str
    product_id:  int
    shop_id:     int
    status:      str
    date_added:  datetime
    date_sold:   Optional[datetime] = None

    class Config:
        from_attributes = True


# ── STOCK TRANSFER (admin only) ───────────────────────────────────────────────
class StockTransfer(BaseModel):
    item_id:    int   # inventory record ID to transfer
    to_shop_id: int   # destination branch


# ── POINT OF SALE SCHEMAS ─────────────────────────────────────────────────────
class POSCheckout(BaseModel):
    """Checkout a specific phone by IMEI. shop_id is derived from the authenticated user."""
    imei_number:    str     = Field(..., min_length=15, max_length=15)
    sale_price:     Decimal = Field(..., gt=0, decimal_places=2)
    payment_method: Literal["cash", "mpesa", "card"] = "cash"


class QuickSell(BaseModel):
    """Sell one unit of an accessory. shop_id is derived from the authenticated user."""
    product_id:     int
    sale_price:     Decimal = Field(..., gt=0, decimal_places=2)
    payment_method: Literal["cash", "mpesa", "card"] = "cash"


# ── SALE RESPONSE SCHEMA ──────────────────────────────────────────────────────
class SaleResponse(BaseModel):
    id:             int
    imei_item_id:   int
    shop_id:        int
    cashier_id:     int
    sale_price:     Decimal
    payment_method: str
    sold_at:        datetime

    class Config:
        from_attributes = True


# ── USER SCHEMAS ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    shop_id: int
    role: Literal["cashier", "manager", "admin"] = "cashier"


class UserResponse(BaseModel):
    id:       int
    username: str
    shop_id:  int
    role:     str

    class Config:
        from_attributes = True


class UserShopUpdate(BaseModel):
    shop_id: int