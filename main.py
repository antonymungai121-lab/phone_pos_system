from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routes import shops, products, inventory, sales

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Multi-Shop POS API")

# Add this CORS block to allow your desktop HTML file to talk to the server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows any frontend to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shops.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(sales.router)

@app.get("/")
def root_check():
    return {"status": "System Online"}
from app.routes import shops, products, inventory, sales
from app import auth # Add this import at the top

# ... (keep your existing CORS and DB code) ...

app.include_router(auth.router) # Add this with your other routers
app.include_router(shops.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(sales.router)