"""
Image generation service for creating thumbnails and reel images.
"""
from pathlib import Path
from typing import List, Tuple
from PIL import Image, ImageDraw
from app.services.ai_background_generator import AIBackgroundGenerator
from app.core.config import BrandConfig, get_brand_config, BrandType
from app.core.brand_colors import get_brand_colors, get_brand_display_name
from app.core.constants import (
    REEL_WIDTH,
    REEL_HEIGHT,
    TOP_MARGIN,
    BOTTOM_MARGIN,
    SIDE_MARGIN,
    H_PADDING,
    TITLE_SIDE_PADDING,
    CONTENT_SIDE_PADDING,
    BAR_HEIGHT,
    BAR_GAP,
    VERTICAL_CORRECTION,
    LINE_SPACING,
    SECTION_SPACING,
    TITLE_FONT_SIZE,
    CONTENT_FONT_SIZE,
    CTA_FONT_SIZE,
    BRAND_FONT_SIZE,
    FONT_BOLD,
    FONT_REGULAR,
    FONT_CONTENT,
    CONTENT_LETTER_SPACING,
)
from app.utils.fonts import (
    get_title_font,
    get_content_font,
    get_cta_font,
    get_brand_font,
    load_font,
    calculate_dynamic_font_size,
)
from app.utils.text_layout import (
    wrap_text,
    draw_text_centered,
    draw_multiline_text_centered,
    draw_text_with_background,
    calculate_total_content_height,
    get_text_dimensions,
)
from app.utils.text_formatting import (
    extract_keyword_from_line,
    draw_mixed_text,
    parse_bold_text,
    wrap_text_with_bold,
    draw_text_with_letter_spacing,
    get_text_width_with_letter_spacing,
)


class ImageGenerator:
    """Service for generating reel images and thumbnails."""
    
    def __init__(self, brand_type: BrandType, variant: str = "light", brand_name: str = "gymcollege", ai_prompt: str = None):
        """
        Initialize the image generator.
        
        Args:
            brand_type: The brand type to use for styling
            variant: Variant type ("light" or "dark")
            brand_name: Brand name ("gymcollege", "healthycollege", or "vitalitycollege")
            ai_prompt: Custom AI prompt for dark mode backgrounds (optional)
        """
        self.brand_config = get_brand_config(brand_type)
        self.width = REEL_WIDTH
        self.height = REEL_HEIGHT
        self.variant = variant
        self.brand_name = brand_name
        self.ai_prompt = ai_prompt
        self._ai_background = None  # Cache AI background for dark mode reuse
        
        # Load brand-specific colors from centralized configuration
        self.brand_colors = get_brand_colors(brand_name, variant)
        
        # Pre-generate AI background for dark mode (one image for both thumbnail and content)
        if variant == "dark":
            ai_generator = AIBackgroundGenerator()
            self._ai_background = ai_generator.generate_background(self.brand_name, self.ai_prompt)
    
    def generate_thumbnail(
        self,
        title: str,
        output_path: Path
    ) -> Path:
        """
        Generate a thumbnail image.
        
        Thumbnail format:
        - Brand background color (light mode) or AI background (dark mode)
        - Centered title (large, uppercase)
        - Brand name at bottom
        
        Args:
            title: The title text
            output_path: Path to save the thumbnail
            
        Returns:
            Path to the generated thumbnail
        """
        # Load or generate thumbnail background based on variant
        if self.variant == "light":
            # Light mode: use template images
            template_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "light mode" / "thumbnail_template.png"
            image = Image.open(template_path)
        else:
            # Dark mode: use cached AI background with overlay
            image = self._ai_background.copy()
            
            # Apply 50% dark overlay for thumbnail (5% darker for better white text visibility)
            overlay = Image.new('RGBA', (self.width, self.height), (0, 0, 0, int(255 * 0.50)))
            image = image.convert('RGBA')
            image = Image.alpha_composite(image, overlay)
            image = image.convert('RGB')
            
        draw = ImageDraw.Draw(image)
        
        # Convert title to uppercase
        title_upper = title.upper()
        
        # Load title font
        title_font = get_title_font(TITLE_FONT_SIZE)
        
        # Wrap title if needed
        max_title_width = self.width - (SIDE_MARGIN * 2)
        title_lines = wrap_text(title_upper, title_font, max_title_width)
        
        # Calculate vertical center position for title
        title_height = sum(
            get_text_dimensions(line, title_font)[1] for line in title_lines
        ) + (LINE_SPACING * (len(title_lines) - 1))
        
        title_y = (self.height - title_height) // 2
        
        # Draw title lines using brand_colors configuration
        text_color = self.brand_colors.thumbnail_text_color
        
        for line in title_lines:
            line_width, line_height = get_text_dimensions(line, title_font)
            x = (self.width - line_width) // 2
            draw.text((x, title_y), line, font=title_font, fill=text_color)
            title_y += line_height + LINE_SPACING
        
        # Dark mode: Add brand name in white text 254px below title
        if self.variant == "dark":
            brand_y = title_y + 254
            brand_text = get_brand_display_name(self.brand_name)
            brand_font = get_brand_font(BRAND_FONT_SIZE)
            brand_width, _ = get_text_dimensions(brand_text, brand_font)
            brand_x = (self.width - brand_width) // 2
            draw.text((brand_x, brand_y), brand_text, font=brand_font, fill=(255, 255, 255))
        
        # Save thumbnail
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)
        
        return output_path
    
    def generate_reel_image(
        self,
        title: str,
        lines: List[str],
        output_path: Path,
        title_font_size: int = 56
    ) -> Path:
        """
        Generate a reel image.
        
        Reel format:
        - Title at top with highlight banner
        - Content lines with support for **text** markdown for bold formatting
        - Auto-wrapping text
        - Dynamic font scaling if needed
        
        Args:
            title: The title text
            lines: List of content lines (supports **text** for bold, can include anything)
            output_path: Path to save the reel image
            
        Returns:
            Path to the generated reel image
        """
        # Load or generate content background based on variant
        if self.variant == "light":
            # Light mode: use template images
            template_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "light mode" / "content_template.png"
            image = Image.open(template_path)
        else:
            # Dark mode: use cached AI background with overlay
            image = self._ai_background.copy()
            
            # Apply 75% dark overlay for content (10% darker than before)
            overlay = Image.new('RGBA', (self.width, self.height), (0, 0, 0, int(255 * 0.75)))
            image = image.convert('RGBA')
            image = Image.alpha_composite(image, overlay)
            image = image.convert('RGB')
        
        draw = ImageDraw.Draw(image)
        
        # Fixed layout values
        title_start_y = 280  
        title_side_margin = TITLE_SIDE_PADDING  # 90px for title
        content_side_margin = CONTENT_SIDE_PADDING  # 108px for content
        max_title_width = self.width - (title_side_margin * 2)  # 1080 - 180 = 900px for title
        max_content_width = self.width - (content_side_margin * 2)  # 1080 - 216 = 864px for content
        
        # Content font settings - Browallia New Bold at 49px
        content_font_size = CONTENT_FONT_SIZE  # 49px
        line_spacing_multiplier = 1.0  # Default line spacing for Browallia New
        title_content_padding = 90
        
        import random
        import re
        
        # Helper function to detect if line is a CTA (call-to-action)
        def is_cta_line(line):
            """Detect if a line is a CTA/closing line (not enumerable content)."""
            cta_patterns = [
                r'follow.*page', r'save.*post', r'share.*friend',
                r'comment.*below', r'link.*bio', r'check.*out',
                r'subscribe', r'tap.*link', r'click.*link',
                r'tag.*friend', r'drop.*comment', r'let.*know',
                r'starts.*with', r'begins.*with', r'remember.*this',
                r'don\'t.*forget', r'keep.*mind', r'your.*health',
                r'your.*body', r'take.*action', r'make.*change'
            ]
            line_lower = line.lower()
            return any(re.search(pattern, line_lower) for pattern in cta_patterns)
        
        # Helper function to detect if content is enumeration-style
        def is_enumeration_content(content_lines):
            """Detect if content lines represent an enumeration (list of similar items)."""
            if len(content_lines) < 3:
                return False
            # Check if most lines have similar structure (dash separator or similar format)
            dash_count = sum(1 for line in content_lines if '—' in line or ' - ' in line or ': ' in line)
            return dash_count >= len(content_lines) * 0.5  # At least 50% have separators
        
        # Step 1: Add numbering to ALL lines (including CTA - CTA MUST have a number)
        if len(lines) > 1:
            # Remove any existing numbers and add fresh sequential numbers to ALL lines
            numbered_lines = []
            for i, line in enumerate(lines, 1):
                # Remove any existing number prefix (e.g., "1. ", "2. ")
                line_without_number = re.sub(r'^\d+\.\s*', '', line.strip())
                # Add new sequential number to EVERY line (including CTA)
                numbered_lines.append(f"{i}. {line_without_number}")
            lines = numbered_lines
        
        # Step 2: Healthycollege - shuffle content (reorder for variety), keep last line in place
        if self.brand_name == "healthycollege" and len(lines) > 1:
            last_line = lines[-1]
            middle_lines = lines[:-1]
            
            # Shuffle middle lines (truly random, not seeded)
            shuffled_middle = middle_lines.copy()
            random.shuffle(shuffled_middle)
            
            # Renumber after shuffling (all lines have numbers now)
            renumbered_middle = []
            for i, line in enumerate(shuffled_middle, 1):
                line_without_number = re.sub(r'^\d+\.\s*', '', line.strip())
                renumbered_middle.append(f"{i}. {line_without_number}")
            
            # Last line always gets renumbered too
            last_line_without_number = re.sub(r'^\d+\.\s*', '', last_line.strip())
            renumbered_last = f"{len(renumbered_middle) + 1}. {last_line_without_number}"
            lines = renumbered_middle + [renumbered_last]
        
        # Convert title to uppercase
        title_upper = title.upper()
        
        # Check for manual line breaks (\n) in title
        if '\n' in title_upper:
            # User specified manual line breaks - use specified font size (default 56px)
            title_font = load_font(FONT_BOLD, title_font_size)
            title_wrapped = [line.strip() for line in title_upper.split('\n') if line.strip()]
            
            # Validate each line fits at specified font size (using title max width)
            for i, line in enumerate(title_wrapped, 1):
                bbox = title_font.getbbox(line)
                line_width = bbox[2] - bbox[0]
                if line_width > max_title_width:
                    raise ValueError(
                        f"Title line {i} doesn't fit: '{line}' is {line_width}px wide "
                        f"(max: {max_title_width}px at {title_font_size}px font). "
                        f"Try shorter text, different line break position, or smaller font size."
                    )
            
            print(f"📝 Using manual line breaks: {len(title_wrapped)} lines at {title_font_size}px")
        else:
            # No manual breaks - use auto-wrap logic with scaling from specified size down to 20px
            current_title_font_size = title_font_size
            title_font = None
            title_wrapped = []
            
            while current_title_font_size >= 20:
                title_font = load_font(FONT_BOLD, current_title_font_size)
                title_wrapped = wrap_text(title_upper, title_font, max_title_width)
                
                if len(title_wrapped) <= 2:
                    break
                current_title_font_size -= 1
            print(f"📝 Using auto-wrap: {len(title_wrapped)} lines at {current_title_font_size}px")
        
        # Load content fonts - Browallia New Bold for content text
        content_font = load_font(FONT_CONTENT, content_font_size)  # Browallia New Bold 49px
        content_bold_font = load_font(FONT_CONTENT, content_font_size)  # Same font (already bold)
        cta_font = load_font(FONT_CONTENT, content_font_size)  # Same font for CTA
        brand_font = get_brand_font(BRAND_FONT_SIZE)
        
        # Start rendering at title position
        current_y = title_start_y
        
        # Dark mode: use brand-specific colors for title background
        # Use brand_colors configuration for title styling
        title_bg_color = self.brand_colors.content_title_bg_color
        title_text_color = self.brand_colors.content_title_text_color
        
        # Calculate metrics for all lines
        metrics = []
        for line in title_wrapped:
            bbox = title_font.getbbox(line)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            metrics.append((line, w, h, bbox))
        
        # Find max text width for stepped effect
        max_text_width = max(w for _, w, _, _ in metrics)
        # Use consistent padding for both light and dark mode now that H_PADDING is globally 20px
        max_bar_width = max_text_width + H_PADDING * 2
        center_x = self.width // 2
        
        # Draw each title line with stepped background bars
        draw = ImageDraw.Draw(image, 'RGBA')
        y = current_y
        
        for line, text_w, _, bbox in metrics:
            # Calculate inset for stepped effect
            inset = (max_text_width - text_w) / 2
            
            # Draw background bar
            bar_left = int(center_x - max_bar_width / 2 + inset)
            bar_right = int(center_x + max_bar_width / 2 - inset)
            bar_top = y
            bar_bottom = y + BAR_HEIGHT
            
            draw.rectangle(
                [(bar_left, bar_top), (bar_right, bar_bottom)],
                fill=title_bg_color
            )
            
            # Calculate precise text position
            glyph_top = bbox[1]
            glyph_height = bbox[3] - bbox[1]
            
            text_x = int(center_x - text_w / 2)
            text_y = int(
                bar_top
                + (BAR_HEIGHT - glyph_height) / 2
                - glyph_top
                + VERTICAL_CORRECTION
                + 1.5  # Move text down 1.5px
            )
            
            draw.text((text_x, text_y), line, font=title_font, fill=title_text_color)
            
            # Move to next line
            y += BAR_HEIGHT + BAR_GAP
        
        # Update current_y for content positioning
        current_y = y
        
        # Add padding between title and content
        current_y += title_content_padding
        
        # Draw numbered content lines with **bold** markdown support
        text_color = (255, 255, 255) if self.variant == "dark" else (0, 0, 0)  # White for dark mode, black for light
        
        # Calculate letter spacing (0.78x of default = 22% tighter)
        # For 49px Browallia New, typical character width is ~20px, so -22% = ~-4px letter spacing
        content_letter_spacing = int(content_font_size * CONTENT_LETTER_SPACING)  # -22% of font size
        
        for i, line in enumerate(lines):
            # Parse the entire line for **bold** markdown
            line_segments = parse_bold_text(line)
            
            # Calculate total width with letter spacing to see if it fits on one line
            line_width = 0
            for segment_text, is_bold in line_segments:
                font = content_bold_font if is_bold else content_font
                line_width += get_text_width_with_letter_spacing(segment_text, font, content_letter_spacing)
            
            if line_width <= max_content_width:
                # Fits on one line - draw with mixed fonts and letter spacing
                x_pos = content_side_margin
                for segment_text, is_bold in line_segments:
                    font = content_bold_font if is_bold else content_font
                    x_pos = draw_text_with_letter_spacing(draw, x_pos, current_y, segment_text, font, text_color, content_letter_spacing)
                
                # Get line height from first segment
                first_font = content_bold_font if line_segments[0][1] else content_font
                bbox = first_font.getbbox("A")
                line_height = bbox[3] - bbox[1]
                current_y += int(line_height * line_spacing_multiplier)
            else:
                # Doesn't fit - wrap with bold formatting preserved
                wrapped_lines = wrap_text_with_bold(
                    line_segments, 
                    content_font, 
                    content_bold_font, 
                    max_content_width
                )
                
                # Draw each wrapped line with mixed fonts and letter spacing
                for wrapped_line_segments in wrapped_lines:
                    x_pos = content_side_margin
                    for segment_text, is_bold in wrapped_line_segments:
                        font = content_bold_font if is_bold else content_font
                        x_pos = draw_text_with_letter_spacing(draw, x_pos, current_y, segment_text, font, text_color, content_letter_spacing)
                    
                    # Move to next line
                    bbox = content_font.getbbox("A")
                    line_height = bbox[3] - bbox[1]
                    current_y += int(line_height * line_spacing_multiplier)
            
            # Add spacing between bullet points (reduced for tighter layout)
            current_y += int(content_font_size * 0.6)  # Reduced from full line_spacing_multiplier
        
        # Dark mode: Add brand name in white text at bottom (12px from edge, 15px font size)
        if self.variant == "dark":
            brand_text = get_brand_display_name(self.brand_name)
            brand_font = load_font(FONT_BOLD, 15)  # 15px font size
            brand_width, brand_height = get_text_dimensions(brand_text, brand_font)
            brand_x = (self.width - brand_width) // 2
            brand_y = self.height - brand_height - 12  # 12px from bottom
            draw.text((brand_x, brand_y), brand_text, font=brand_font, fill=(255, 255, 255))
        
        # Save the image
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path, 'PNG', quality=95)
        
        return output_path
