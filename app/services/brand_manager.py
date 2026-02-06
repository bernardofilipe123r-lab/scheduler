"""
Centralized Brand Management Service.

This module provides a single source of truth for all brand-related data.
It replaces all hardcoded brand constants throughout the codebase.

Key features:
- All brand data stored in PostgreSQL database
- CRUD operations for brands
- Seeding from legacy hardcoded values
- Caching for performance
- Fallback to env vars for credentials
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# Default brand colors (used for seeding new installs)
DEFAULT_BRAND_COLORS = {
    "healthycollege": {
        "primary": "#004f00",
        "accent": "#22c55e",
        "color_name": "vibrant green",
        "light_mode": {
            "background": "#dffbcb",
            "gradient_start": "#116611",
            "gradient_end": "#004f00",
            "text": "#004f00",
            "cta_bg": "#004f00",
            "cta_text": "#ffffff"
        },
        "dark_mode": {
            "background": "#001f00",
            "gradient_start": "#002200",
            "gradient_end": "#003300",
            "text": "#ffffff",
            "cta_bg": "#22c55e",
            "cta_text": "#000000"
        }
    },
    "longevitycollege": {
        "primary": "#019dc8",
        "accent": "#0ea5e9",
        "color_name": "electric blue",
        "light_mode": {
            "background": "#cff2ff",
            "gradient_start": "#0891b2",
            "gradient_end": "#019dc8",
            "text": "#019dc8",
            "cta_bg": "#019dc8",
            "cta_text": "#ffffff"
        },
        "dark_mode": {
            "background": "#001f2e",
            "gradient_start": "#0c4a6e",
            "gradient_end": "#082f49",
            "text": "#ffffff",
            "cta_bg": "#0ea5e9",
            "cta_text": "#000000"
        }
    },
    "vitalitycollege": {
        "primary": "#028f7a",
        "accent": "#14b8a6",
        "color_name": "teal",
        "light_mode": {
            "background": "#ccfbf1",
            "gradient_start": "#0d9488",
            "gradient_end": "#028f7a",
            "text": "#028f7a",
            "cta_bg": "#028f7a",
            "cta_text": "#ffffff"
        },
        "dark_mode": {
            "background": "#001f1a",
            "gradient_start": "#134e4a",
            "gradient_end": "#0f3a36",
            "text": "#ffffff",
            "cta_bg": "#14b8a6",
            "cta_text": "#000000"
        }
    },
    "holisticcollege": {
        "primary": "#f0836e",
        "accent": "#f97316",
        "color_name": "coral orange",
        "light_mode": {
            "background": "#ffe4de",
            "gradient_start": "#fb923c",
            "gradient_end": "#f0836e",
            "text": "#c2410c",
            "cta_bg": "#f0836e",
            "cta_text": "#ffffff"
        },
        "dark_mode": {
            "background": "#1f0f0a",
            "gradient_start": "#7c2d12",
            "gradient_end": "#431407",
            "text": "#ffffff",
            "cta_bg": "#f97316",
            "cta_text": "#000000"
        }
    },
    "wellbeingcollege": {
        "primary": "#ebbe4d",
        "accent": "#eab308",
        "color_name": "golden yellow",
        "light_mode": {
            "background": "#fef9c3",
            "gradient_start": "#facc15",
            "gradient_end": "#ebbe4d",
            "text": "#854d0e",
            "cta_bg": "#ebbe4d",
            "cta_text": "#000000"
        },
        "dark_mode": {
            "background": "#1f1a05",
            "gradient_start": "#713f12",
            "gradient_end": "#422006",
            "text": "#ffffff",
            "cta_bg": "#eab308",
            "cta_text": "#000000"
        }
    }
}


# Default brand configurations for seeding
DEFAULT_BRANDS = {
    "healthycollege": {
        "display_name": "THE HEALTHY COLLEGE",
        "short_name": "HCO",
        "instagram_handle": "@thehealthycollege",
        "facebook_page_name": "The Healthy College",
        "youtube_channel_name": "The Healthy College",
        "schedule_offset": 0,
        "posts_per_day": 6,
        "baseline_for_content": False,
    },
    "longevitycollege": {
        "display_name": "THE LONGEVITY COLLEGE",
        "short_name": "LCO",
        "instagram_handle": "@thelongevitycollege",
        "facebook_page_name": "The Longevity College",
        "youtube_channel_name": "The Longevity College",
        "schedule_offset": 2,
        "posts_per_day": 6,
        "baseline_for_content": True,  # This is the baseline for content differentiation
    },
    "vitalitycollege": {
        "display_name": "THE VITALITY COLLEGE",
        "short_name": "VCO",
        "instagram_handle": "@thevitalitycollege",
        "facebook_page_name": "The Vitality College",
        "youtube_channel_name": "The Vitality College",
        "schedule_offset": 4,
        "posts_per_day": 6,
        "baseline_for_content": False,
    },
    "holisticcollege": {
        "display_name": "THE HOLISTIC COLLEGE",
        "short_name": "HLC",
        "instagram_handle": "@theholisticcollege",
        "facebook_page_name": "The Holistic College",
        "youtube_channel_name": "The Holistic College",
        "schedule_offset": 6,
        "posts_per_day": 6,
        "baseline_for_content": False,
    },
    "wellbeingcollege": {
        "display_name": "THE WELLBEING COLLEGE",
        "short_name": "WCO",
        "instagram_handle": "@thewellbeingcollege",
        "facebook_page_name": "The Wellbeing College",
        "youtube_channel_name": "The Wellbeing College",
        "schedule_offset": 8,
        "posts_per_day": 6,
        "baseline_for_content": False,
    },
}


class BrandManager:
    """
    Centralized brand management service.
    
    Uses database as source of truth with fallback to environment variables
    for credentials.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self._cache: Dict[str, Any] = {}
        self._cache_time: Optional[datetime] = None
        self._cache_ttl = 60  # seconds
    
    def _get_brand_model(self):
        """Import Brand model lazily to avoid circular imports."""
        from app.models import Brand
        return Brand
    
    def _invalidate_cache(self):
        """Clear the brand cache."""
        self._cache = {}
        self._cache_time = None
    
    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid."""
        if not self._cache_time:
            return False
        age = (datetime.utcnow() - self._cache_time).total_seconds()
        return age < self._cache_ttl
    
    def get_all_brands(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all brands from database."""
        Brand = self._get_brand_model()
        
        query = self.db.query(Brand)
        if not include_inactive:
            query = query.filter(Brand.active == True)
        
        brands = query.order_by(Brand.display_name).all()
        return [b.to_dict() for b in brands]
    
    def get_brand(self, brand_id: str) -> Optional[Dict[str, Any]]:
        """Get a single brand by ID."""
        Brand = self._get_brand_model()
        brand = self.db.query(Brand).filter(Brand.id == brand_id).first()
        return brand.to_dict() if brand else None
    
    def get_brand_with_credentials(self, brand_id: str) -> Optional[Dict[str, Any]]:
        """Get a brand including its credentials (for publishing)."""
        Brand = self._get_brand_model()
        brand = self.db.query(Brand).filter(Brand.id == brand_id).first()
        
        if not brand:
            return None
        
        data = brand.to_dict(include_credentials=True)
        
        # Fallback to environment variables if DB credentials are not set
        env_prefix = brand_id.upper().replace("COLLEGE", "_COLLEGE")
        
        if not data.get("instagram_access_token"):
            data["instagram_access_token"] = os.getenv(f"{env_prefix}_META_ACCESS_TOKEN") or os.getenv(f"{env_prefix}_INSTAGRAM_ACCESS_TOKEN")
        
        if not data.get("instagram_business_account_id"):
            data["instagram_business_account_id"] = os.getenv(f"{env_prefix}_INSTAGRAM_BUSINESS_ACCOUNT_ID")
        
        if not data.get("facebook_page_id"):
            data["facebook_page_id"] = os.getenv(f"{env_prefix}_FACEBOOK_PAGE_ID")
        
        if not data.get("facebook_access_token"):
            data["facebook_access_token"] = os.getenv(f"{env_prefix}_META_ACCESS_TOKEN") or os.getenv(f"{env_prefix}_FACEBOOK_ACCESS_TOKEN")
        
        if not data.get("meta_access_token"):
            data["meta_access_token"] = os.getenv(f"{env_prefix}_META_ACCESS_TOKEN")
        
        return data
    
    def get_all_brand_ids(self) -> List[str]:
        """Get list of all active brand IDs."""
        Brand = self._get_brand_model()
        brands = self.db.query(Brand.id).filter(Brand.active == True).all()
        return [b.id for b in brands]
    
    def get_brand_colors(self, brand_id: str) -> Optional[Dict[str, Any]]:
        """Get just the colors for a brand."""
        Brand = self._get_brand_model()
        brand = self.db.query(Brand).filter(Brand.id == brand_id).first()
        return brand.colors if brand else None
    
    def get_baseline_brand(self) -> Optional[str]:
        """Get the brand marked as baseline for content differentiation."""
        Brand = self._get_brand_model()
        brand = self.db.query(Brand).filter(Brand.baseline_for_content == True).first()
        return brand.id if brand else None
    
    def create_brand(self, brand_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new brand."""
        Brand = self._get_brand_model()
        
        # Check if brand already exists
        existing = self.db.query(Brand).filter(Brand.id == brand_data["id"]).first()
        if existing:
            raise ValueError(f"Brand '{brand_data['id']}' already exists")
        
        # Create brand
        brand = Brand(
            id=brand_data["id"],
            display_name=brand_data["display_name"],
            short_name=brand_data.get("short_name", brand_data["id"][:3].upper()),
            instagram_handle=brand_data.get("instagram_handle"),
            facebook_page_name=brand_data.get("facebook_page_name"),
            youtube_channel_name=brand_data.get("youtube_channel_name"),
            schedule_offset=brand_data.get("schedule_offset", 0),
            posts_per_day=brand_data.get("posts_per_day", 6),
            baseline_for_content=brand_data.get("baseline_for_content", False),
            colors=brand_data.get("colors", {}),
            instagram_access_token=brand_data.get("instagram_access_token"),
            instagram_business_account_id=brand_data.get("instagram_business_account_id"),
            facebook_page_id=brand_data.get("facebook_page_id"),
            facebook_access_token=brand_data.get("facebook_access_token"),
            meta_access_token=brand_data.get("meta_access_token"),
            logo_path=brand_data.get("logo_path"),
            active=brand_data.get("active", True),
        )
        
        self.db.add(brand)
        self.db.commit()
        self.db.refresh(brand)
        
        self._invalidate_cache()
        logger.info(f"Created brand: {brand.id}")
        
        return brand.to_dict()
    
    def update_brand(self, brand_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing brand."""
        Brand = self._get_brand_model()
        
        brand = self.db.query(Brand).filter(Brand.id == brand_id).first()
        if not brand:
            return None
        
        # Update fields
        for key, value in updates.items():
            if hasattr(brand, key) and key not in ["id", "created_at"]:
                setattr(brand, key, value)
        
        self.db.commit()
        self.db.refresh(brand)
        
        self._invalidate_cache()
        logger.info(f"Updated brand: {brand_id}")
        
        return brand.to_dict()
    
    def delete_brand(self, brand_id: str) -> bool:
        """Delete a brand (soft delete - sets active=False)."""
        Brand = self._get_brand_model()
        
        brand = self.db.query(Brand).filter(Brand.id == brand_id).first()
        if not brand:
            return False
        
        brand.active = False
        self.db.commit()
        
        self._invalidate_cache()
        logger.info(f"Deactivated brand: {brand_id}")
        
        return True
    
    def seed_default_brands(self) -> int:
        """
        Seed default brands if none exist.
        
        Returns the number of brands seeded.
        """
        Brand = self._get_brand_model()
        
        existing_count = self.db.query(Brand).count()
        if existing_count > 0:
            logger.info(f"Brands already exist ({existing_count}), skipping seed")
            return 0
        
        logger.info("Seeding default brands...")
        seeded = 0
        
        for brand_id, config in DEFAULT_BRANDS.items():
            colors = DEFAULT_BRAND_COLORS.get(brand_id, {})
            
            brand = Brand(
                id=brand_id,
                display_name=config["display_name"],
                short_name=config["short_name"],
                instagram_handle=config.get("instagram_handle"),
                facebook_page_name=config.get("facebook_page_name"),
                youtube_channel_name=config.get("youtube_channel_name"),
                schedule_offset=config.get("schedule_offset", 0),
                posts_per_day=config.get("posts_per_day", 6),
                baseline_for_content=config.get("baseline_for_content", False),
                colors=colors,
                active=True,
            )
            
            self.db.add(brand)
            seeded += 1
        
        self.db.commit()
        logger.info(f"Seeded {seeded} default brands")
        
        return seeded


# Singleton-like accessor for convenience
_brand_manager_instance: Optional[BrandManager] = None


def get_brand_manager(db: Session) -> BrandManager:
    """Get a BrandManager instance for the given database session."""
    return BrandManager(db)


def seed_brands_if_needed(db: Session):
    """Seed default brands if the brands table is empty."""
    manager = get_brand_manager(db)
    return manager.seed_default_brands()
