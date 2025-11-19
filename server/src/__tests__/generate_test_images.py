#!/usr/bin/env python3
"""
Generate sample test images for integration testing of the packing algorithm.
Creates various sized rectangles to test utilization and packing efficiency.
"""

from PIL import Image, ImageDraw, ImageFont
import os


def create_test_image(width_px, height_px, color, label, output_path):
    """
    Create a simple colored rectangle image with a label.

    Args:
        width_px: Width in pixels
        height_px: Height in pixels
        color: RGB color tuple
        label: Text label for the image
        output_path: Path to save the image
    """
    # Create image
    img = Image.new('RGB', (width_px, height_px), color=color)
    draw = ImageDraw.Draw(img)

    # Draw border
    draw.rectangle([(0, 0), (width_px-1, height_px-1)], outline='black', width=3)

    # Add label in center
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    except:
        font = ImageFont.load_default()

    # Get text bounding box
    bbox = draw.textbbox((0, 0), label, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # Center the text
    x = (width_px - text_width) // 2
    y = (height_px - text_height) // 2

    draw.text((x, y), label, fill='white', font=font)

    # Save image
    img.save(output_path)
    print(f"Created: {output_path} ({width_px}x{height_px})")


def main():
    # Create output directory
    test_images_dir = os.path.join(os.path.dirname(__file__), 'test_images')
    os.makedirs(test_images_dir, exist_ok=True)

    # Define test images (width_inches, height_inches, color, label)
    # At 300 DPI for typical sticker printing
    DPI = 300

    test_specs = [
        # Large items (Big Rocks)
        (3.0, 3.0, (255, 0, 0), "Large-3x3"),
        (4.0, 2.0, (0, 128, 255), "Large-4x2"),
        (2.5, 3.5, (128, 0, 255), "Large-2.5x3.5"),

        # Medium items
        (2.0, 2.0, (0, 255, 0), "Med-2x2"),
        (2.5, 1.5, (255, 128, 0), "Med-2.5x1.5"),
        (1.5, 2.5, (255, 0, 128), "Med-1.5x2.5"),

        # Small items (should backfill gaps)
        (1.0, 1.0, (255, 255, 0), "Small-1x1"),
        (1.5, 1.0, (0, 255, 255), "Small-1.5x1"),
        (1.0, 1.5, (255, 0, 255), "Small-1x1.5"),
        (0.75, 0.75, (128, 128, 255), "Tiny-0.75x0.75"),
    ]

    # Generate images
    for width_in, height_in, color, label in test_specs:
        width_px = int(width_in * DPI)
        height_px = int(height_in * DPI)
        filename = f"{label.lower().replace('.', '_')}.png"
        output_path = os.path.join(test_images_dir, filename)
        create_test_image(width_px, height_px, color, label, output_path)

    print(f"\nGenerated {len(test_specs)} test images in {test_images_dir}")
    print("\nYou can now use these images for integration testing!")


if __name__ == '__main__':
    main()
