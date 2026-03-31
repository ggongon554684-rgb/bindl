from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    APP_ENV: str = "development"
    FRONTEND_URL: str = "http://localhost:3000"
    BASE_RPC_URL: str = "http://127.0.0.1:7545"
    CHAIN_ID: int = 1337
    CONTRACT_ADDRESS: str
    SIGNER_PRIVATE_KEY: str
    GEMINI_API_KEY: str
    PROTOCOL_FEE_BPS: int = 200
    FEE_RECIPIENT: str

    # Mail settings
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = 587

    # Xendit settings for USDC withdrawal
    XENDIT_SECRET_KEY:    str   = ""     # from dashboard.xendit.co → API Keys
    WITHDRAWAL_FEE_PCT:   float = 1.0   # % fee charged on each withdrawal

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()