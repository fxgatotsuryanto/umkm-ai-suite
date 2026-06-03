from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.database import Base


class AppSettings(Base):
    """Key-value store untuk konfigurasi aplikasi (mis. cloud_api_key)."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BusinessProfile(Base):
    __tablename__ = "business_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    type: Mapped[str] = mapped_column(String(100), default="retail")
    description: Mapped[str] = mapped_column(Text, default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    wa_greeting: Mapped[str] = mapped_column(
        Text, default="Halo! Ada yang bisa saya bantu?"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[float] = mapped_column(Float, default=0)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str] = mapped_column(String(100), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FAQ(Base):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100), default="umum")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChatHistory(Base):
    __tablename__ = "chat_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    wa_number: Mapped[str] = mapped_column(String(20))
    customer_name: Mapped[str] = mapped_column(String(200), default="")
    message_in: Mapped[str] = mapped_column(Text)
    message_out: Mapped[str] = mapped_column(Text)
    tokens_used: Mapped[int] = mapped_column(Integer, default=2)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ContentLibrary(Base):
    __tablename__ = "content_library"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform: Mapped[str] = mapped_column(String(50))
    content_type: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(200), default="")
    content: Mapped[str] = mapped_column(Text)
    hashtags: Mapped[str] = mapped_column(Text, default="")
    cta: Mapped[str] = mapped_column(Text, default="")
    tokens_used: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TokenBalance(Base):
    __tablename__ = "token_balance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)
    package: Mapped[str] = mapped_column(String(50), default="starter")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_synced: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class TokenLedger(Base):
    __tablename__ = "token_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(100))
    amount: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    reference_id: Mapped[str] = mapped_column(String(200), default="")
    synced: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WebChatConfig(Base):
    __tablename__ = "webchat_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_name: Mapped[str] = mapped_column(String(100), default="AI Assistant")
    greeting: Mapped[str] = mapped_column(
        Text, default="Halo! Ada yang bisa saya bantu? \U0001f60a"
    )
    theme_color: Mapped[str] = mapped_column(String(20), default="#16a34a")
    system_prompt_extra: Mapped[str] = mapped_column(Text, default="")
    cta_wa_number: Mapped[str] = mapped_column(String(20), default="")
    telegram_chat_id: Mapped[str] = mapped_column(String(50), default="")
    webhook_url: Mapped[str] = mapped_column(String(500), default="")
    auto_open: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WebChatSession(Base):
    __tablename__ = "webchat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    visitor_name: Mapped[str] = mapped_column(String(200), default="")
    visitor_wa: Mapped[str] = mapped_column(String(20), default="")
    visitor_email: Mapped[str] = mapped_column(String(200), default="")
    kebutuhan: Mapped[str] = mapped_column(Text, default="")
    solusi: Mapped[str] = mapped_column(Text, default="")
    lead_captured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_active: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WebChatMessage(Base):
    __tablename__ = "webchat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(100), index=True)
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
