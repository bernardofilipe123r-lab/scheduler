"""
Caption builder service for generating Instagram captions.
"""
from typing import List
from app.core.constants import DEFAULT_HASHTAGS


class CaptionBuilder:
    """Service for building Instagram captions deterministically."""
    
    def __init__(self, hashtags: List[str] = None):
        """
        Initialize the caption builder.
        
        Args:
            hashtags: Optional list of hashtags to use. Defaults to DEFAULT_HASHTAGS.
        """
        self.hashtags = hashtags or DEFAULT_HASHTAGS
    
    def build_caption(
        self,
        title: str,
        lines: List[str]
    ) -> str:
        """
        Build a complete caption from the provided components.
        
        Format:
        {TITLE}
        
        1. Line one
        2. Line two
        3. Line three
        
        #hashtag1 #hashtag2 #hashtag3
        
        Args:
            title: The title text
            lines: List of content lines (can include CTA if desired)
            
        Returns:
            The formatted caption
        """
        # Start with title (uppercase)
        caption_parts = [title.upper()]
        caption_parts.append("")  # Empty line after title
        
        # Add content lines (strip **bold** markdown and don't add numbers if already numbered)
        for i, line in enumerate(lines, 1):
            # Remove **bold** markdown
            clean_line = line.replace('**', '')
            
            # Check if line already starts with a number
            if clean_line.strip() and clean_line.strip()[0].isdigit():
                # Already numbered, use as-is
                caption_parts.append(clean_line)
            else:
                # Add number
                caption_parts.append(f"{i}. {clean_line}")
        
        caption_parts.append("")  # Empty line before hashtags
        
        # Add hashtags
        hashtag_line = " ".join(self.hashtags)
        caption_parts.append(hashtag_line)
        
        # Join all parts with newlines
        return "\n".join(caption_parts)
    
    def add_hashtag(self, hashtag: str) -> None:
        """
        Add a hashtag to the default list.
        
        Args:
            hashtag: Hashtag to add (with or without #)
        """
        # Ensure hashtag starts with #
        if not hashtag.startswith("#"):
            hashtag = f"#{hashtag}"
        
        if hashtag not in self.hashtags:
            self.hashtags.append(hashtag)
    
    def remove_hashtag(self, hashtag: str) -> None:
        """
        Remove a hashtag from the default list.
        
        Args:
            hashtag: Hashtag to remove (with or without #)
        """
        # Ensure hashtag starts with #
        if not hashtag.startswith("#"):
            hashtag = f"#{hashtag}"
        
        if hashtag in self.hashtags:
            self.hashtags.remove(hashtag)
    
    def set_hashtags(self, hashtags: List[str]) -> None:
        """
        Replace the entire hashtag list.
        
        Args:
            hashtags: New list of hashtags
        """
        # Ensure all hashtags start with #
        self.hashtags = [
            tag if tag.startswith("#") else f"#{tag}"
            for tag in hashtags
        ]
