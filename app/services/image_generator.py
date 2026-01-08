"""
Image generation service for creating thumbnails and reel images.
"""
from pathlib import Path
from typing import List, Tuple
from PIL import Image, ImageDraw
from app.services.ai_background_generator import AIBackgroundGenerator
from app.core.config import BrandConfig, get_brand_config, BrandType
from app.core.constants import (
    REEL_WIDTH,
    REEL_HEIGHT,
    TOP_MARGIN,
    BOTTOM_MARGIN,
    SIDE_MARGIN,
    LINE_SPACING,
    SECTION_SPACING,
    TITLE_FONT_SIZE,
    CONTENT_FONT_SIZE,
    CTA_FONT_SIZE,
    BRAND_FONT_SIZE,
    FONT_BOLD,
    FONT_REGULAR,
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
)


class ImageGenerator:
    """Service for generating reel images and thumbnails."""
    
    def __init__(self, brand_type: BrandType, variant: str = "light", brand_name: str = "gymcollege", ai_prompt: str = None):
        """
        Initialize the image generator.
        
        Args:
            brand_type: The brand type to use for styling
            variant: Variant type ("light" or "dark")
            brand_name: Brand name ("gymcollege" or "healthycollege")
            ai_prompt: Custom AI prompt for dark mode backgrounds (optional)
        """
        self.brand_config = get_brand_config(brand_type)
        self.width = REEL_WIDTH
        self.height = REEL_HEIGHT
        self.variant = variant
        self.brand_name = brand_name
        self.ai_prompt = ai_prompt
        
        # Brand-specific color overrides for light mode
        if variant == "light":
            if brand_name == "gymcollege":
                # Gymcollege: Dark blue #00435c for thumbnail title and blue highlight for content title
                self.brand_config.thumbnail_text_color = (0, 67, 92)  # #00435c - Dark azure blue
                self.brand_config.content_highlight_color = (200, 234, 246, 255)  # #c8eaf6
            elif brand_name == "healthycollege":
                # Healthycollege: Green highlight for content title, green thumbnail text
                self.brand_config.content_highlight_color = (209, 246, 200, 255)  # #d1f6c8
                self.brand_config.thumbnail_text_color = (0, 100, 0)  # #006400
    
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
            # Dark mode: generate AI background with overlay
            ai_generator = AIBackgroundGenerator()
            image = ai_generator.generate_background(self.brand_name, self.ai_prompt)
            
            # Apply 45% dark overlay
            overlay = Image.new('RGBA', (self.width, self.height), (0, 0, 0, int(255 * 0.45)))
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
        
        # Draw title lines (white text for dark mode, brand color for light mode)
        text_color = (255, 255, 255) if self.variant == "dark" else self.brand_config.thumbnail_text_color
        for line in title_lines:
            line_width, line_height = get_text_dimensions(line, title_font)
            x = (self.width - line_width) // 2
            draw.text((x, title_y), line, font=title_font, fill=text_color)
            title_y += line_height + LINE_SPACING
        
        # Dark mode: Add brand logo/text 254px below title
        if self.variant == "dark":
            brand_y = title_y + 254
            
            # Try to load brand logo, fallback to text
            if self.brand_name == "gymcollege":
                logo_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "dark mode" / "template_thumb.png"
            else:  # healthycollege
                logo_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "darkmode" / "template_thumb.png"
            
            if logo_path.exists():
                logo = Image.open(logo_path)
                # Resize logo to 50% of original size
                new_size = (logo.width // 2, logo.height // 2)
                logo = logo.resize(new_size, Image.Resampling.LANCZOS)
                # Center the logo
                logo_x = (self.width - logo.width) // 2
                image.paste(logo, (logo_x, brand_y), logo if logo.mode == 'RGBA' else None)
            else:
                # Fallback: draw brand text
                brand_text = "THE GYM COLLEGE" if self.brand_name == "gymcollege" else "HEALTHY COLLEGE"
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
        output_path: Path
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
            # Dark mode: generate AI background with overlay
            ai_generator = AIBackgroundGenerator()
            image = ai_generator.generate_background(self.brand_name, self.ai_prompt)
            
            # Apply 65% dark overlay
            overlay = Image.new('RGBA', (self.width, self.height), (0, 0, 0, int(255 * 0.65)))
            image = image.convert('RGBA')
            image = Image.alpha_composite(image, overlay)
            image = image.convert('RGB')
        
        draw = ImageDraw.Draw(image)
        
        # Convert title to uppercase
        title_upper = title.upper()
        
        # Fixed layout values
        title_start_y = 280  # Reduced from 304 to 30 (about 10x smaller)
        content_side_margin = 109
        max_content_width = self.width - (content_side_margin * 2)  # 1080 - 218 = 862px
        
        # Brand-specific font sizes
        content_font_size = 38 if self.brand_name == "healthycollege" else 39  # 1px smaller for healthycollege
        line_spacing_multiplier = 1.4
        title_content_padding = 90
        
        # Healthycollege: reorder content lines (shuffle all except last)
        if self.brand_name == "healthycollege" and len(lines) > 1:
            import random
            import re
            
            last_line = lines[-1]
            middle_lines = lines[:-1]
            
            # Shuffle middle lines with a fixed seed based on title for consistency
            random.seed(hash(title))
            shuffled_middle = middle_lines.copy()
            random.shuffle(shuffled_middle)
            
            # If lines have numbers (1., 2., etc.), strip them and renumber after shuffling
            renumbered_middle = []
            for i, line in enumerate(shuffled_middle, 1):
                # Remove any existing number prefix (e.g., "1. ", "2. ")
                line_without_number = re.sub(r'^\d+\.\s*', '', line.strip())
                # Add new sequential number
                renumbered_middle.append(f"{i}. {line_without_number}")
            
            # Renumber the last line
            last_line_without_number = re.sub(r'^\d+\.\s*', '', last_line.strip())
            renumbered_last = f"{len(renumbered_middle) + 1}. {last_line_without_number}"
            
            lines = renumbered_middle + [renumbered_last]
        
        # Find optimal title font size (start at 56, reduce until fits in 2 lines)
        title_font_size = 56
        title_font = None
        title_wrapped = []
        
        while title_font_size >= 20:
            title_font = load_font(FONT_BOLD, title_font_size)
            title_wrapped = wrap_text(title_upper, title_font, max_content_width)
            
            if len(title_wrapped) <= 2:
                break
            title_font_size -= 1
        
        # Load other fonts
        content_font = load_font(FONT_REGULAR, content_font_size)
        content_bold_font = load_font(FONT_BOLD, content_font_size)
        cta_font = load_font(FONT_BOLD, content_font_size)
        brand_font = get_brand_font(BRAND_FONT_SIZE)
        
        # Start rendering at title position
        current_y = title_start_y
        
        # Dark mode: use brand-specific colors for title background
        if self.variant == "dark":
            if self.brand_name == "gymcollege":
                title_bg_color = (0, 74, 173, 255)  # #004aad
            else:  # healthycollege
                title_bg_color = (0, 100, 0, 255)  # #006400
        else:
            title_bg_color = self.brand_config.content_highlight_color
        
        # Title styling constants
        BAR_HEIGHT = 90
        BAR_GAP = 0
        H_PADDING = 28
        VERTICAL_CORRECTION = -2  # Optical adjustment for text positioning
        
        title_text_color = (255, 255, 255) if self.variant == "dark" else self.brand_config.content_title_color
        
        # Calculate metrics for all lines
        metrics = []
        for line in title_wrapped:
            bbox = title_font.getbbox(line)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            metrics.append((line, w, h, bbox))
        
        # Find max text width for stepped effect
        max_text_width = max(w for _, w, _, _ in metrics)
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
        
        for i, line in enumerate(lines):
            # Parse the entire line for **bold** markdown
            line_segments = parse_bold_text(line)
            
            # Calculate total width to see if it fits on one line
            line_width = 0
            for segment_text, is_bold in line_segments:
                font = content_bold_font if is_bold else content_font
                bbox_seg = font.getbbox(segment_text)
                line_width += bbox_seg[2] - bbox_seg[0]
            
            if line_width <= max_content_width:
                # Fits on one line - draw with mixed fonts
                x_pos = content_side_margin
                for segment_text, is_bold in line_segments:
                    font = content_bold_font if is_bold else content_font
                    draw.text((x_pos, current_y), segment_text, font=font, fill=text_color)
                    bbox_seg = font.getbbox(segment_text)
                    x_pos += bbox_seg[2] - bbox_seg[0]
                
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
                
                # Draw each wrapped line with mixed fonts
                for wrapped_line_segments in wrapped_lines:
                    x_pos = content_side_margin
                    for segment_text, is_bold in wrapped_line_segments:
                        font = content_bold_font if is_bold else content_font
                        draw.text((x_pos, current_y), segment_text, font=font, fill=text_color)
                        bbox_seg = font.getbbox(segment_text)
                        x_pos += bbox_seg[2] - bbox_seg[0]
                    
                    # Move to next line
                    bbox = content_font.getbbox("A")
                    line_height = bbox[3] - bbox[1]
                    current_y += int(line_height * line_spacing_multiplier)
            
            # Add one empty line spacing after each bullet point
            current_y += int(content_font_size * line_spacing_multiplier)
        
        # Dark mode: Add brand logo at bottom (10px from edge)
        if self.variant == "dark":
            if self.brand_name == "gymcollege":
                logo_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "dark mode" / "template_thumb.png"
            else:  # healthycollege
                logo_path = Path(__file__).resolve().parent.parent.parent / "assets" / "templates" / self.brand_name / "darkmode" / "template_thumb.png"
            
            if logo_path.exists():
                logo = Image.open(logo_path)
                # Resize logo to 50% of original size
                new_size = (logo.width // 2, logo.height // 2)
                logo = logo.resize(new_size, Image.Resampling.LANCZOS)
                # Position 10px from bottom, centered horizontally
                logo_x = (self.width - logo.width) // 2
                logo_y = self.height - logo.height - 10
                image.paste(logo, (logo_x, logo_y), logo if logo.mode == 'RGBA' else None)
        
        # Save the image
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path, 'PNG', quality=95)
        
        return output_path
