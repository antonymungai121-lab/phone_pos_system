import os
from dotenv import load_dotenv

# Load variables from the .env file
load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./pos_database.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "fallback-secret-key")

settings = Settings()