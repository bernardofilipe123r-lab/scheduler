"""
User cost tracking models — per-user daily and monthly cost aggregation.

Daily records kept for 30 days, then aggregated into monthly summaries.
"""
from sqlalchemy import Column, String, Integer, Float, Date, Index
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, DateTime


class UserCostDaily(Base):
    __tablename__ = "user_cost_daily"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    date = Column(Date, nullable=False)
    deepseek_calls = Column(Integer, default=0)
    deepseek_input_tokens = Column(Integer, default=0)
    deepseek_output_tokens = Column(Integer, default=0)
    deepseek_cost_usd = Column(Float, default=0.0)
    deapi_calls = Column(Integer, default=0)
    deapi_cost_usd = Column(Float, default=0.0)
    reels_generated = Column(Integer, default=0)
    carousels_generated = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default="now()")
    updated_at = Column(DateTime(timezone=True), server_default="now()")

    __table_args__ = (
        Index("idx_user_cost_daily_date", "date"),
    )


class UserCostMonthly(Base):
    __tablename__ = "user_cost_monthly"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    month = Column(Date, nullable=False)
    deepseek_calls = Column(Integer, default=0)
    deepseek_input_tokens = Column(Integer, default=0)
    deepseek_output_tokens = Column(Integer, default=0)
    deepseek_cost_usd = Column(Float, default=0.0)
    deapi_calls = Column(Integer, default=0)
    deapi_cost_usd = Column(Float, default=0.0)
    reels_generated = Column(Integer, default=0)
    carousels_generated = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default="now()")
    updated_at = Column(DateTime(timezone=True), server_default="now()")

    __table_args__ = (
        Index("idx_user_cost_monthly_month", "month"),
    )
