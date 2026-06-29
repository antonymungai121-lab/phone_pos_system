import os
from dotenv import load_dotenv

# Load variables from the .env file
load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./pos_database.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    # Comma-separated list of allowed frontend origins, e.g. "http://localhost:5500,https://yourshop.com"
    ALLOWED_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",") if o.strip()
    ]
    # One-time setup secret: must match SETUP_SECRET in .env to call /auth/force-setup
    SETUP_SECRET: str = os.getenv("SETUP_SECRET", "")

    def __post_init__(self):
        if not self.SECRET_KEY:
            raise RuntimeError("SECRET_KEY is not set in environment. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\"")

settings = Settings()