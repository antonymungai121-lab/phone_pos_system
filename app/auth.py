from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.database import get_db
from app import models

# Security Settings
SECRET_KEY = "your-super-secret-key-change-this-later"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 hour shift

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
router = APIRouter(prefix="/auth", tags=["Security"])

# --- Security Functions ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- The Checkpoint (We will put this on protected routes) ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# The Login Route
@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # --- DIAGNOSTIC X-RAY ---
    print("\n--- NEW LOGIN ATTEMPT ---")
    print(f"Username received: '{form_data.username}'")
    print(f"Password received: '{form_data.password}'")
    
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    
    if not user:
        print("❌ Result: Username not found in the database!")
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    if not verify_password(form_data.password, user.hashed_password):
        print("❌ Result: Username found, but the password did not match the hash!")
        raise HTTPException(status_code=400, detail="Incorrect username or password")
        
    print(" Result: SUCCESS! Password verified.")

    access_token = create_access_token(data={"sub": user.username})
    
    # UPGRADED RETURN: We are now sending the shop_id and username back to the browser!
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "shop_id": user.shop_id,
        "username": user.username
    }

@router.get("/force-setup")
def force_setup(db: Session = Depends(get_db)):
    # 1. Ensure the Gatura Shop exists in this specific database
    shop = db.query(models.Shop).filter(models.Shop.id == 1).first()
    if not shop:
        shop = models.Shop(name="Main Branch", location="Gatura")
        db.add(shop)
        db.commit()
        db.refresh(shop)

    # 2. Check if admin exists, if not, create it!
    user = db.query(models.User).filter(models.User.username == "admin").first()
    if user:
        return {"status": "Admin already exists in this database."}
    
    admin_user = models.User(
        username="admin",
        hashed_password=get_password_hash("1234"),
        shop_id=shop.id
    )
    db.add(admin_user)
    db.commit()
    return {"status": "✅ SUCCESS! Admin user safely injected into the active database."}