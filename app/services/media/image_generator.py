"""
Image generation service for creating thumbnails and reel images.
"""
from pathlib import Path
from typing import List, Optional
from PIL import Image, ImageDraw
from app.services.media.ai_background import AIBackgroundGenerator
from app.core.config import get_brand_config
from app.core.brand_colors import get_brand_colors, get_brand_display_name
from app.core.constants import (
    REEL_WIDTH,
    REEL_HEIGHT,
    SIDE_MARGIN,
    H_PADDING,
    TITLE_SIDE_PADDING,
    CONTENT_SIDE_PADDING,
    TITLE_CONTENT_SPACING,
    BOTTOM_MARGIN,
    BAR_HEIGHT,
    BAR_GAP,
    VERTICAL_CORRECTION,
    LINE_SPACING,
    TITLE_FONT_SIZE,
    CONTENT_FONT_SIZE,
    BRAND_FONT_SIZE,
    FONT_BOLD,
    FONT_CONTENT_REGULAR,
    FONT_CONTENT_MEDIUM,
    USE_BOLD_CONTENT,
    CONTENT_LINE_SPACING,
)
from app.utils.fonts import (
    get_title_font,
    get_brand_font,
    load_font,
)
from app.utils.text_layout import (
    wrap_text,
    get_text_dimensions,
)
from app.utils.text_formatting import (
    parse_bold_text,
    wrap_text_with_bold,
)


class ImageGenerator:
    """Service for generating reel images and thumbnails."""
    
    def __init__(self, brand_type, variant: str = "light", brand_name: str = "default", ai_prompt: str = None, content_context: str = None):
        """
        Initialize the image generator.
        
        Args:
            brand_type: The brand type to use for styling
            variant: Variant type ("light" or "dark")
            brand_name: Brand name ("gymcollege", "healthycollege", "vitalitycollege", or "longevitycollege")
            ai_prompt: Custom AI prompt for dark mode backgrounds (optional)
            content_context: Title/content for AI background generation (optional)
        """
        import sys
        print(f"🎨 ImageGenerator.__init__() called", flush=True)
        print(f"   brand_type={brand_type}, variant={variant}, brand_name={brand_name}", flush=True)
        sys.stdout.flush()
        
        self.brand_config = get_brand_config(brand_type)
        self.width = REEL_WIDTH
        self.height = REEL_HEIGHT
        self.variant = variant
        self.brand_name = brand_name
        self.ai_prompt = ai_prompt
        self.content_context = content_context
        self._ai_background = None  # Cache AI background for dark mode reuse
        
        print(f"   Loading brand colors...", flush=True)
        # Load brand-specific colors from centralized configuration
        self.brand_colors = get_brand_colors(brand_name, variant)
        print(f"   ✓ Brand colors loaded: {type(self.brand_colors).__name__}", flush=True)
        
        # Note: AI background generation is now deferred until content is available
        # This happens in _get_or_generate_ai_background()
        
        print(f"   ✓ ImageGenerator initialized successfully", flush=True)
        sys.stdout.flush()
    
    def _get_or_generate_ai_background(self, title: str = None, lines: list = None) -> Image.Image:
        """
        Get cached AI background or generate one with content context.
        
        Args:
            title: Title text for content-derived visuals
            lines: Content lines for content-derived visuals
            
        Returns:
            PIL Image with AI-generated background
        """
        if self._ai_background is not None:
            return self._ai_background
        
        if self.variant != "dark":
            return None
        
        import sys
        print(f"   🌙 Dark mode - generating AI background with content context...", flush=True)
        sys.stdout.flush()
        
        # Build content context from title and lines
        content_context = self.content_context
        if not content_context:
            parts = []
            if title:
                parts.append(title)
            if lines:
                parts.extend(lines[:3])  # Use first 3 content lines
            content_context = " | ".join(parts) if parts else None
        
        print(f"   📝 Content context: {content_context[:100] if content_context else 'None'}...", flush=True)
        
        ai_generator = AIBackgroundGenerator()
        self._ai_background = ai_generator.generate_background(
            self.brand_name, 
            self.ai_prompt,
            content_context=content_context
        )
        print(f"   ✓ AI background generated", flush=True)
        
        return self._ai_background
    
    def generate_youtube_thumbnail(
        self,
        title: str,
        lines: list,
        output_path: Path
    ) -> Path:
        """
        Generate a clean YouTube thumbnail with ONLY the AI-generated image.
        No text, no overlay - just the pure visual for maximum impact on YouTube.
        
        For both light AND dark mode, we generate an AI background specifically
        for YouTube since YouTube thumbnails work best with striking visuals.
        
        Args:
            title: Title text for content context
            lines: Content lines for context
            output_path: Path to save the thumbnail
            
        Returns:
            Path to the generated YouTube thumbnail
        """
        import sys
        print(f"   📺 generate_youtube_thumbnail() called", flush=True)
        print(f"      output_path: {output_path}", flush=True)
        sys.stdout.flush()
        
        # For YouTube, ALWAYS generate an AI background regardless of variant
        # This ensures striking visuals for YouTube thumbnails
        content_context = self.content_context
        if not content_context:
            parts = []
            if title:
                parts.append(title)
            if lines:
                parts.extend(lines[:3])
            content_context = " | ".join(parts) if parts else None
        
        # Check if we already have an AI background cached
        if self._ai_background is not None:
            print(f"      Using cached AI background", flush=True)
            image = self._ai_background.copy()
        else:
            # Generate new AI background for YouTube
            print(f"      🎨 Generating AI background for YouTube thumbnail...", flush=True)
            ai_generator = AIBackgroundGenerator()
            image = ai_generator.generate_background(
                self.brand_name, 
                self.ai_prompt,
                content_context=content_context
            )
            # Cache it for potential reuse
            self._ai_background = image.copy()
            print(f"      ✓ AI background generated for YouTube", flush=True)
        
        # Save the CLEAN image - no text, no overlay
        # YouTube thumbnails work best with pure striking visuals
        # Save as JPEG to stay under YouTube's 2MB thumbnail limit
        # (AI-generated PNGs at 1080x1920 often exceed 2MB)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Convert RGBA to RGB if needed (JPEG doesn't support alpha)
        save_image = image.convert('RGB') if image.mode == 'RGBA' else image
        
        # Use .jpg extension for the saved file
        jpg_path = output_path.with_suffix('.jpg')
        save_image.save(jpg_path, format='JPEG', quality=90, optimize=True)
        file_size = jpg_path.stat().st_size
        print(f"      ✓ YouTube thumbnail saved as JPEG ({file_size / 1024:.0f} KB, clean AI image, no text)", flush=True)
        
        # If caller expected .png path, also note the actual path
        if output_path.suffix.lower() != '.jpg':
            print(f"      ℹ️ Note: saved as {jpg_path.name} (JPEG for YouTube 2MB limit)", flush=True)
        
        return jpg_path

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
        import sys
        print(f"   🖼️  generate_thumbnail() called", flush=True)
        print(f"      title: {title[:50]}...", flush=True)
        print(f"      output_path: {output_path}", flush=True)
        sys.stdout.flush()
        
        # Load or generate thumbnail background based on variant
        if self.variant == "light":
            # Light mode: dynamic solid-color background with brand text
            print(f"      🎨 Generating dynamic light mode thumbnail for {self.brand_name}", flush=True)
            image = Image.new('RGB', (self.width, self.height), (244, 244, 244))  # #f4f4f4
            print(f"      ✓ Light mode background created", flush=True)
        else:
            # Dark mode: use AI background with content context
            print(f"      🌙 Using AI background for dark mode", flush=True)
            ai_bg = self._get_or_generate_ai_background(title=title)
            image = ai_bg.copy()
            
            # Apply 55% dark overlay for thumbnail (darker for better white text visibility)
            overlay = Image.new('RGBA', (self.width, self.height), (0, 0, 0, int(255 * 0.55)))
            image = image.convert('RGBA')
            image = Image.alpha_composite(image, overlay)
            image = image.convert('RGB')
            print(f"      ✓ Dark overlay applied", flush=True)
            
        draw = ImageDraw.Draw(image)
        
        # Convert title to uppercase
        title_upper = title.upper()
        
        # Maximum width for title (respecting side margins)
        max_title_width = self.width - (SIDE_MARGIN * 2)
        
        # Check for manual line breaks (\n) in title
        if '\n' in title_upper:
            # User specified manual line breaks - respect them
            # Start with default font size and scale down if needed
            current_font_size = TITLE_FONT_SIZE
            title_font = get_title_font(current_font_size)
            title_lines = [line.strip() for line in title_upper.split('\n') if line.strip()]
            
            # Check if any line exceeds max width and scale down
            while current_font_size >= 40:  # Minimum font size
                title_font = get_title_font(current_font_size)
                all_fit = True
                for line in title_lines:
                    line_width, _ = get_text_dimensions(line, title_font)
                    if line_width > max_title_width:
                        all_fit = False
                        break
                if all_fit:
                    break
                current_font_size -= 2
            
            if current_font_size < TITLE_FONT_SIZE:
                print(f"      📏 Thumbnail title scaled: {TITLE_FONT_SIZE}px → {current_font_size}px", flush=True)
        else:
            # No manual breaks - auto-fit with new algorithm
            # Auto-fit: range 75-98, prefer 3 lines over 4, maximize font
            min_font = 75
            max_font = 98

            # Short text: fits in ≤2 lines at max
            tf_max = get_title_font(max_font)
            if len(wrap_text(title_upper, tf_max, max_title_width)) <= 2:
                current_font_size = max_font
            else:
                # Find largest font in 75-98 that gives exactly 3 lines (preferred)
                found = False
                for fs in range(max_font, min_font - 1, -1):
                    tf = get_title_font(fs)
                    if len(wrap_text(title_upper, tf, max_title_width)) == 3:
                        current_font_size = fs
                        found = True
                        break

                if not found:
                    # Can't get 3 lines at >=75 — find largest font in 75-98 for 4 lines
                    for fs in range(max_font, min_font - 1, -1):
                        tf = get_title_font(fs)
                        if len(wrap_text(title_upper, tf, max_title_width)) == 4:
                            current_font_size = fs
                            found = True
                            break

                if not found:
                    # Even 75px gives 5+ lines — go below until 4 lines
                    for fs in range(min_font - 1, 39, -1):
                        tf = get_title_font(fs)
                        if len(wrap_text(title_upper, tf, max_title_width)) <= 4:
                            current_font_size = fs
                            found = True
                            break

                if not found:
                    current_font_size = min_font

            title_font = get_title_font(current_font_size)
            title_lines = wrap_text(title_upper, title_font, max_title_width)

            # Safety clamp: NEVER more than 4 lines
            if len(title_lines) > 4:
                title_lines = title_lines[:3] + [' '.join(title_lines[3:])]

            if current_font_size != 80:
                print(f"      📏 Thumbnail title auto-fit: {current_font_size}px ({len(title_lines)} lines)", flush=True)
        
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
        
        # Add brand name below the title
        brand_text = get_brand_display_name(self.brand_name)
        brand_font = load_font(FONT_BOLD, 28)
        brand_width, brand_height = get_text_dimensions(brand_text, brand_font)
        brand_x = (self.width - brand_width) // 2
        brand_y = title_y + 254
        brand_text_color = self.brand_colors.thumbnail_text_color if self.variant == "light" else (255, 255, 255)
        draw.text((brand_x, brand_y), brand_text, font=brand_font, fill=brand_text_color)
        
        # Save thumbnail
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)
        print(f"      ✓ Thumbnail saved to {output_path}", flush=True)
        sys.stdout.flush()
        
        return output_path
    
    def generate_reel_image(
        self,
        title: str,
        lines: List[str],
        output_path: Path,
        title_font_size: int = 56,
        cta_type: Optional[str] = None,
        ctx=None
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
            cta_type: Optional CTA type (legacy, used as fallback text)
            ctx: Optional PromptContext for weighted CTA selection
            
        Returns:
            Path to the generated reel image
        """
        # Add CTA line — prefer weighted selection from ctx, fall back to cta_type text
        if ctx or cta_type:
            from app.core.cta import get_cta_line
            cta_line = get_cta_line(ctx) if ctx else (cta_type or "")
            if cta_line:
                lines = lines.copy()
                lines.append(cta_line)
        
        # Load or generate content background based on variant
        if self.variant == "light":
            # Light mode: dynamic solid-color background
            image = Image.new('RGB', (self.width, self.height), (244, 244, 244))  # #f4f4f4
        else:
            # Dark mode: use AI background with content context
            ai_bg = self._get_or_generate_ai_background(title=title, lines=lines)
            image = ai_bg.copy()
            
            # Apply 80% dark overlay for content
            overlay = Image.new('RGBA', (self.width, self.height), (0, 0, 0, int(255 * 0.85)))
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
        
        # Content font settings from constants
        content_font_size = CONTENT_FONT_SIZE
        line_spacing_multiplier = CONTENT_LINE_SPACING
        title_content_padding = TITLE_CONTENT_SPACING
        
        import re
        
        # ============================================================
        # NUMBERING SYSTEM
        # Ensures all content lines have proper sequential numbering
        # Content differentiation is handled by ContentDifferentiator service
        # ============================================================
        
        # Add numbering to ALL lines (including CTA - CTA MUST have a number)
        if len(lines) > 1:
            # Remove any existing numbers and add fresh sequential numbers to ALL lines
            numbered_lines = []
            for i, line in enumerate(lines, 1):
                # Remove any existing number prefix (e.g., "1. ", "2. ")
                line_without_number = re.sub(r'^\d+\.\s*', '', line.strip())
                # Add new sequential number to EVERY line (including CTA)
                numbered_lines.append(f"{i}. {line_without_number}")
            lines = numbered_lines
        
        # ============================================================
        # END NUMBERING SYSTEM
        # ============================================================
        
        # Convert title to uppercase
        title_upper = title.upper()
        
        # Check for manual line breaks (\n) in title
        if '\n' in title_upper:
            # User specified manual line breaks — auto-reduce font if any line overflows
            title_wrapped = [line.strip() for line in title_upper.split('\n') if line.strip()]
            current_title_font_size = title_font_size
            
            while current_title_font_size >= 30:
                title_font = load_font(FONT_BOLD, current_title_font_size)
                all_fit = True
                for line in title_wrapped:
                    bbox = title_font.getbbox(line)
                    line_width = bbox[2] - bbox[0]
                    if line_width > max_title_width:
                        all_fit = False
                        break
                if all_fit:
                    break
                current_title_font_size -= 2
            
            if current_title_font_size != title_font_size:
                print(f"📝 Auto-reduced font: {title_font_size}px → {current_title_font_size}px to fit manual line breaks")
            else:
                print(f"📝 Using manual line breaks: {len(title_wrapped)} lines at {current_title_font_size}px")
        else:
            # No manual breaks - use stepped auto-scaling: 56 → 46 → 40 → 36 (minimum)
            font_size_steps = [s for s in [56, 46, 40, 36] if s <= title_font_size]
            if not font_size_steps or font_size_steps[0] < title_font_size:
                font_size_steps.insert(0, title_font_size)
            
            title_font = None
            title_wrapped = []
            current_title_font_size = font_size_steps[0]
            
            for step_size in font_size_steps:
                current_title_font_size = step_size
                title_font = load_font(FONT_BOLD, current_title_font_size)
                title_wrapped = wrap_text(title_upper, title_font, max_title_width)
                
                if len(title_wrapped) <= 2:
                    break
            print(f"📝 Using auto-wrap: {len(title_wrapped)} lines at {current_title_font_size}px")
        
        # Calculate title height to determine content start position
        title_height = len(title_wrapped) * (BAR_HEIGHT + BAR_GAP)
        if len(title_wrapped) > 0:
            title_height -= BAR_GAP  # Remove last gap
        
        # Function to calculate actual content height with given font size
        def calculate_actual_content_height(font_size, lines_list, max_width, side_margin):
            """Calculate the exact height content will take with given font size."""
            test_font_file = FONT_CONTENT_MEDIUM if USE_BOLD_CONTENT else FONT_CONTENT_REGULAR
            test_font = load_font(test_font_file, font_size)
            test_bold_font = load_font(test_font_file, font_size)
            
            total_height = 0
            test_bbox = test_font.getbbox("A")
            base_line_height = test_bbox[3] - test_bbox[1]
            
            for line in lines_list:
                # Parse line for bold segments
                line_segments = parse_bold_text(line)
                
                # Calculate line width
                line_width = 0
                for segment_text, is_bold in line_segments:
                    font = test_bold_font if is_bold else test_font
                    bbox_seg = font.getbbox(segment_text)
                    line_width += bbox_seg[2] - bbox_seg[0]
                
                if line_width <= max_width:
                    # Single line
                    total_height += int(base_line_height * line_spacing_multiplier)
                else:
                    # Multiple lines - need to wrap
                    wrapped = wrap_text_with_bold(line_segments, test_font, test_bold_font, max_width)
                    total_height += len(wrapped) * int(base_line_height * line_spacing_multiplier)
                
                # Add bullet spacing
                total_height += int(font_size * 0.6)
            
            return total_height
        
        # Check if we need to reduce font size - loop until content fits
        content_start_y = title_start_y + title_height + title_content_padding
        min_font_size = 20
        max_bottom_y = self.height - BOTTOM_MARGIN
        
        # Calculate with initial font size
        content_height = calculate_actual_content_height(content_font_size, lines, max_content_width, content_side_margin)
        content_bottom_y = content_start_y + content_height
        
        # Reduce font size if needed
        while content_bottom_y > max_bottom_y and content_font_size > min_font_size:
            content_font_size -= 1
            content_height = calculate_actual_content_height(content_font_size, lines, max_content_width, content_side_margin)
            content_bottom_y = content_start_y + content_height
        
        if content_font_size < CONTENT_FONT_SIZE:
            print(f"📐 Reduced content font to {content_font_size}px to maintain {BOTTOM_MARGIN}px bottom margin (content ends at y={int(content_bottom_y)})")
        
        # Load content fonts based on USE_BOLD_CONTENT setting
        content_font_file = FONT_CONTENT_MEDIUM if USE_BOLD_CONTENT else FONT_CONTENT_REGULAR
        content_font = load_font(content_font_file, content_font_size)
        content_bold_font = load_font(content_font_file, content_font_size)  # Same font for consistency
        
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
                
                # Get line height from first segment and apply line spacing multiplier
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
                    
                    # Move to next line with line spacing multiplier
                    bbox = content_font.getbbox("A")
                    line_height = bbox[3] - bbox[1]
                    current_y += int(line_height * line_spacing_multiplier)
            
            # Add spacing between bullet points (reduced for tighter layout)
            current_y += int(content_font_size * 0.6)  # Reduced from full line_spacing_multiplier
        
        # Add brand name at bottom
        brand_text = get_brand_display_name(self.brand_name)
        brand_font = load_font(FONT_BOLD, 15)
        brand_width, brand_height = get_text_dimensions(brand_text, brand_font)
        brand_x = (self.width - brand_width) // 2
        brand_y = self.height - brand_height - 12
        brand_text_color = self.brand_colors.thumbnail_text_color if self.variant == "light" else (255, 255, 255)
        draw.text((brand_x, brand_y), brand_text, font=brand_font, fill=brand_text_color)
        
        # Save the image
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path, 'PNG', quality=95)
        
        return output_path
