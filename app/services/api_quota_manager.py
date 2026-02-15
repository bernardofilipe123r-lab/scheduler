"""
APIQuotaManager - Distributed rate limiting across agents and services.

Wraps all Meta API calls with quota checking.
Uses token bucket algorithm with sliding window tracking.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import APIQuotaUsage
from app.db_connection import get_db

logger = logging.getLogger(__name__)


class APIQuotaManager:
    """Rate limiter for external API calls."""
    
    LIMITS = {
        'meta': 150,        # Calls per hour (conservative, Meta allows 200)
        'deapi': 500,       # Daily limit for content generation
        'deepseek': 1000,   # Daily limit for AI operations
    }

    HOURLY_SERVICES = {'meta'}
    DAILY_SERVICES = {'deapi', 'deepseek'}
    
    PRIORITY_WEIGHTS = {
        'own_analysis': 1,       # Highest priority
        'performance_fetch': 2,
        'competitor_scrape': 3,
        'general': 4             # Lowest priority
    }
    
    def __init__(self, db: Session = None):
        self._db = db
    
    @property
    def db(self) -> Session:
        if self._db is None:
            self._db = next(get_db())
        return self._db
    
    def can_use(self, service: str, calls_needed: int = 1) -> bool:
        """Check if quota is available for the requested number of calls."""
        limit = self.LIMITS.get(service, 999999)
        if limit >= 999999:
            return True
        
        current_hour = self._current_hour()
        usage = self._get_or_create_usage(service, current_hour)
        available = limit - usage.calls_made
        return available >= calls_needed
    
    def remaining(self, service: str) -> int:
        """Get remaining calls for this hour."""
        limit = self.LIMITS.get(service, 999999)
        current_hour = self._current_hour()
        usage = self._get_or_create_usage(service, current_hour)
        return max(0, limit - usage.calls_made)
    
    def record_usage(self, service: str, calls: int = 1, agent_id: str = None, operation: str = None):
        """Record API calls made."""
        current_hour = self._current_hour()
        usage = self._get_or_create_usage(service, current_hour)
        
        usage.calls_made += calls
        
        if agent_id:
            breakdown = usage.agent_breakdown or {}
            breakdown[agent_id] = breakdown.get(agent_id, 0) + calls
            usage.agent_breakdown = breakdown
        
        if operation:
            breakdown = usage.operation_breakdown or {}
            breakdown[operation] = breakdown.get(operation, 0) + calls
            usage.operation_breakdown = breakdown
        
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.warning(f"Failed to record API usage for {service}")
    
    def get_usage_summary(self) -> Dict:
        """Get current hour usage for all services."""
        current_hour = self._current_hour()
        result = {}
        
        for service, limit in self.LIMITS.items():
            usage = self.db.query(APIQuotaUsage).filter(
                APIQuotaUsage.service == service,
                APIQuotaUsage.hour_window == current_hour
            ).first()
            
            result[service] = {
                'used': usage.calls_made if usage else 0,
                'limit': limit,
                'remaining': limit - (usage.calls_made if usage else 0),
                'reset_at': (current_hour + timedelta(hours=1)).isoformat(),
                'agent_breakdown': usage.agent_breakdown if usage else {},
                'operation_breakdown': usage.operation_breakdown if usage else {}
            }
        
        return result
    
    def get_daily_usage(self, service: str) -> int:
        """Get total calls made for a service today (UTC)."""
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        total = self.db.query(func.coalesce(func.sum(APIQuotaUsage.calls_made), 0)).filter(
            APIQuotaUsage.service == service,
            APIQuotaUsage.hour_window >= today_start,
        ).scalar()
        return int(total)

    def get_daily_summary(self) -> Dict:
        """Get daily usage summary for daily-tracked services (deapi, deepseek)."""
        result = {}
        for service in self.DAILY_SERVICES:
            limit = self.LIMITS.get(service, 500)
            used = self.get_daily_usage(service)
            result[service] = {
                'used': used,
                'limit': limit,
                'remaining': max(0, limit - used),
                'percentage': round(used / limit * 100, 1) if limit else 0,
            }
        return result

    def get_history(self, hours: int = 24) -> list:
        """Get usage history for the last N hours."""
        cutoff = self._current_hour() - timedelta(hours=hours)
        
        rows = self.db.query(APIQuotaUsage).filter(
            APIQuotaUsage.hour_window >= cutoff
        ).order_by(APIQuotaUsage.hour_window).all()
        
        return [
            {
                'hour': r.hour_window.isoformat(),
                'service': r.service,
                'calls_made': r.calls_made,
                'quota_limit': r.quota_limit,
                'agent_breakdown': r.agent_breakdown or {},
                'operation_breakdown': r.operation_breakdown or {}
            }
            for r in rows
        ]
    
    def should_allow(self, service: str, operation: str, calls_needed: int = 1) -> bool:
        """
        Priority-aware quota check.
        High-priority operations get reserved capacity.
        """
        if not self.can_use(service, calls_needed):
            return False
        
        remaining = self.remaining(service)
        priority = self.PRIORITY_WEIGHTS.get(operation, 4)
        
        # Reserve 30% capacity for high-priority operations
        limit = self.LIMITS.get(service, 999999)
        reserved = int(limit * 0.3)
        
        if priority >= 3 and remaining <= reserved:
            logger.info(f"Deferring {operation} — {remaining} calls remaining (reserved: {reserved})")
            return False
        
        return True

    async def fetch_deapi_balance(self) -> dict:
        """Fetch deAPI account balance. Endpoint: GET https://api.deapi.ai/api/v1/client/balance"""
        import os
        import aiohttp

        api_key = os.getenv('DEAPI_API_KEY')
        if not api_key:
            logger.warning('DEAPI_API_KEY not set — cannot fetch deAPI balance')
            return {'error': 'No DEAPI_API_KEY configured'}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    'https://api.deapi.ai/api/v1/client/balance',
                    headers={'Authorization': f'Bearer {api_key}'},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    body = await resp.text()
                    if resp.status == 200:
                        data = await resp.json(content_type=None) if body else {}
                        balance = data.get('balance', 0)
                        account_type = data.get('account_type', 'basic')
                        rpm_limit = 300 if account_type == 'premium' else 3
                        rpd_limit = None if account_type == 'premium' else 100
                        return {
                            'balance': balance,
                            'account_type': account_type,
                            'rpm_limit': rpm_limit,
                            'rpd_limit': rpd_limit,
                            'currency': data.get('currency', 'USD'),
                        }
                    logger.error(f'deAPI balance fetch failed: HTTP {resp.status} — {body[:200]}')
                    return {'error': f'HTTP {resp.status}'}
        except Exception as e:
            logger.error(f'deAPI balance fetch exception: {e}')
            return {'error': str(e)[:200]}

    async def fetch_deepseek_balance(self) -> dict:
        """Fetch DeepSeek account balance. Endpoint: GET https://api.deepseek.com/user/balance"""
        import os
        import aiohttp

        api_key = os.getenv('DEEPSEEK_API_KEY')
        if not api_key:
            logger.warning('DEEPSEEK_API_KEY not set — cannot fetch DeepSeek balance')
            return {'error': 'No DEEPSEEK_API_KEY configured'}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    'https://api.deepseek.com/user/balance',
                    headers={'Authorization': f'Bearer {api_key}'},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    body = await resp.text()
                    if resp.status == 200:
                        data = await resp.json(content_type=None) if body else {}
                        # DeepSeek returns {"is_available": true, "balance_infos": [{"currency": "CNY", "total_balance": "...", "granted_balance": "...", "topped_up_balance": "..."}]}
                        is_available = data.get('is_available', True)
                        balance_infos = data.get('balance_infos', [])
                        # Find USD or CNY balance
                        balance = None
                        currency = 'USD'
                        for info in balance_infos:
                            if info.get('currency') == 'USD':
                                balance = float(info.get('total_balance', 0))
                                currency = 'USD'
                                break
                            elif info.get('currency') == 'CNY':
                                balance = float(info.get('total_balance', 0))
                                currency = 'CNY'
                        return {
                            'balance': balance,
                            'currency': currency,
                            'is_available': is_available,
                        }
                    logger.error(f'DeepSeek balance fetch failed: HTTP {resp.status} — {body[:200]}')
                    return {'error': f'HTTP {resp.status}'}
        except Exception as e:
            logger.error(f'DeepSeek balance fetch exception: {e}')
            return {'error': str(e)[:200]}

    async def fetch_deepseek_info(self) -> dict:
        """Fetch DeepSeek API rate limit info from response headers."""
        import os
        import aiohttp

        api_key = os.getenv('DEEPSEEK_API_KEY')
        if not api_key:
            return {'error': 'No DEEPSEEK_API_KEY configured'}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    'https://api.deepseek.com/models',
                    headers={'Authorization': f'Bearer {api_key}'},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        headers = resp.headers
                        rpm_limit = int(headers.get('x-ratelimit-limit-requests', '0'))
                        rpm_remaining = int(headers.get('x-ratelimit-remaining-requests', str(rpm_limit)))
                        tpm_limit = int(headers.get('x-ratelimit-limit-tokens', '0'))
                        tpm_remaining = int(headers.get('x-ratelimit-remaining-tokens', str(tpm_limit)))
                        result = {}
                        if rpm_limit > 0:
                            result['requests_used'] = rpm_limit - rpm_remaining
                            result['requests_limit'] = rpm_limit
                        if tpm_limit > 0:
                            result['tokens_used'] = tpm_limit - tpm_remaining
                            result['tokens_limit'] = tpm_limit
                        return result if result else {'error': 'No rate limit headers found'}
                    return {'error': f'HTTP {resp.status}'}
        except Exception as e:
            logger.error(f'DeepSeek rate-limit fetch exception: {e}')
            return {'error': str(e)[:200]}

    def _current_hour(self) -> datetime:
        now = datetime.utcnow()
        return now.replace(minute=0, second=0, microsecond=0)
    
    def _get_or_create_usage(self, service: str, hour: datetime) -> APIQuotaUsage:
        usage = self.db.query(APIQuotaUsage).filter(
            APIQuotaUsage.service == service,
            APIQuotaUsage.hour_window == hour
        ).first()
        
        if not usage:
            usage = APIQuotaUsage(
                service=service,
                hour_window=hour,
                quota_limit=self.LIMITS.get(service, 999999),
                calls_made=0
            )
            self.db.add(usage)
            try:
                self.db.commit()
            except Exception:
                self.db.rollback()
                # Another process may have created it
                usage = self.db.query(APIQuotaUsage).filter(
                    APIQuotaUsage.service == service,
                    APIQuotaUsage.hour_window == hour
                ).first()
        
        return usage


# Singleton accessor
_quota_manager: Optional[APIQuotaManager] = None

def get_quota_manager(db: Session = None) -> APIQuotaManager:
    global _quota_manager
    if _quota_manager is None or db is not None:
        _quota_manager = APIQuotaManager(db)
    return _quota_manager
