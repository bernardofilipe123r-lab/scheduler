"""
Text formatting utilities for rendering mixed bold and regular text.
"""
from typing import List, Tuple
from PIL import ImageFont, ImageDraw
import re


def draw_text_with_letter_spacing(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    font: ImageFont.FreeTypeFont,
    color: Tuple[int, int, int],
    letter_spacing: float = 0
) -> int:
    """
    Draw text with custom letter spacing.
    
    Args:
        draw: ImageDraw object
        x: Starting x position
        y: Starting y position
        text: Text to draw
        font: Font to use
        color: RGB color tuple
        letter_spacing: Additional spacing between characters (can be negative)
        
    Returns:
        Final x position after drawing all characters
    """
    if letter_spacing == 0:
        # No letter spacing, use normal draw
        draw.text((x, y), text, font=font, fill=color)
        bbox = font.getbbox(text)
        return x + (bbox[2] - bbox[0])
    
    current_x = x
    for char in text:
        draw.text((current_x, y), char, font=font, fill=color)
        bbox = font.getbbox(char)
        char_width = bbox[2] - bbox[0]
        current_x += char_width + letter_spacing
    
    return current_x


def get_text_width_with_letter_spacing(
    text: str,
    font: ImageFont.FreeTypeFont,
    letter_spacing: float = 0
) -> int:
    """
    Calculate text width with custom letter spacing.
    
    Args:
        text: Text to measure
        font: Font to use
        letter_spacing: Additional spacing between characters (can be negative)
        
    Returns:
        Total width in pixels
    """
    if letter_spacing == 0:
        bbox = font.getbbox(text)
        return bbox[2] - bbox[0]
    
    total_width = 0
    for i, char in enumerate(text):
        bbox = font.getbbox(char)
        char_width = bbox[2] - bbox[0]
        total_width += char_width
        if i < len(text) - 1:  # Don't add spacing after last character
            total_width += letter_spacing
    
    return int(total_width)


def parse_bold_text(text: str) -> List[Tuple[str, bool]]:
    """
    Parse text to identify bold segments marked with **text**.
    
    Args:
        text: Text with **bold** markdown syntax
        
    Returns:
        List of (text_segment, is_bold) tuples
        
    Example:
        Input: "Rice — Always **rinse** before cooking"
        Output: [("Rice — Always ", False), ("rinse", True), (" before cooking", False)]
    """
    # Split by ** markers
    parts = re.split(r'(\*\*.*?\*\*)', text)
    
    result = []
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            # Bold text (remove markers)
            result.append((part[2:-2], True))
        elif part:
            # Regular text
            result.append((part, False))
    
    return result


def get_mixed_text_width(
    text_segments: List[Tuple[str, bool]],
    regular_font: ImageFont.FreeTypeFont,
    bold_font: ImageFont.FreeTypeFont
) -> int:
    """
    Calculate the total width of mixed bold/regular text.
    
    Args:
        text_segments: List of (text, is_bold) tuples
        regular_font: Font for regular text
        bold_font: Font for bold text
        
    Returns:
        Total width in pixels
    """
    total_width = 0
    
    for text, is_bold in text_segments:
        font = bold_font if is_bold else regular_font
        bbox = font.getbbox(text)
        total_width += bbox[2] - bbox[0]
    
    return total_width


def draw_mixed_text(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text_segments: List[Tuple[str, bool]],
    regular_font: ImageFont.FreeTypeFont,
    bold_font: ImageFont.FreeTypeFont,
    color: Tuple[int, int, int]
) -> int:
    """
    Draw mixed bold/regular text starting at position (x, y).
    
    Args:
        draw: ImageDraw object
        x: Starting x position
        y: Starting y position
        text_segments: List of (text, is_bold) tuples
        regular_font: Font for regular text
        bold_font: Font for bold text
        color: RGB color tuple
        
    Returns:
        Final x position after drawing all segments
    """
    current_x = x
    
    for text, is_bold in text_segments:
        font = bold_font if is_bold else regular_font
        draw.text((current_x, y), text, font=font, fill=color)
        
        # Move x position for next segment
        bbox = font.getbbox(text)
        current_x += bbox[2] - bbox[0]
    
    return current_x


def wrap_text_with_bold(
    text_segments: List[Tuple[str, bool]],
    regular_font: ImageFont.FreeTypeFont,
    bold_font: ImageFont.FreeTypeFont,
    max_width: int
) -> List[List[Tuple[str, bool]]]:
    """
    Wrap text with bold segments to fit within max_width.
    
    Args:
        text_segments: List of (text, is_bold) tuples
        regular_font: Font for regular text
        bold_font: Font for bold text
        max_width: Maximum width in pixels
        
    Returns:
        List of wrapped lines, where each line is a list of (text, is_bold) tuples
    """
    lines = []
    current_line = []
    current_width = 0
    
    for segment_text, is_bold in text_segments:
        font = bold_font if is_bold else regular_font
        words = segment_text.split(' ')
        
        for i, word in enumerate(words):
            if not word:  # Skip empty strings from split
                continue
                
            # Determine if we need a space before this word
            needs_space = len(current_line) > 0
            test_word = (' ' + word) if needs_space else word
            
            word_bbox = font.getbbox(test_word)
            word_width = word_bbox[2] - word_bbox[0]
            
            if current_width + word_width <= max_width or not current_line:
                # Word fits on current line (or it's the first word of a new line)
                if needs_space:
                    # Check if last segment has same bold status - if so, append to it
                    if current_line and current_line[-1][1] == is_bold:
                        current_line[-1] = (current_line[-1][0] + ' ' + word, is_bold)
                    else:
                        current_line.append((' ' + word, is_bold))
                else:
                    current_line.append((word, is_bold))
                current_width += word_width
            else:
                # Word doesn't fit, start new line
                if current_line:
                    lines.append(current_line)
                current_line = [(word, is_bold)]
                word_bbox = font.getbbox(word)
                current_width = word_bbox[2] - word_bbox[0]
    
    # Add remaining line
    if current_line:
        lines.append(current_line)
    
    return lines


def extract_keyword_from_line(line: str) -> Tuple[str, str]:
    """
    Extract the keyword (first word before —) from a line.
    
    Args:
        line: Content line (e.g., "Rice — Always rinse before cooking")
        
    Returns:
        Tuple of (keyword, rest_of_line)
        
    Example:
        Input: "Rice — Always rinse before cooking"
        Output: ("Rice", " — Always rinse before cooking")
    """
    if ' — ' in line:
        parts = line.split(' — ', 1)
        return parts[0], ' — ' + parts[1]
    elif ' - ' in line:
        parts = line.split(' - ', 1)
        return parts[0], ' - ' + parts[1]
    else:
        # No separator found, return first word
        words = line.split(' ', 1)
        if len(words) > 1:
            return words[0], ' ' + words[1]
        return line, ''
