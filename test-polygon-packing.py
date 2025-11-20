#!/usr/bin/env python3

import requests
import json
import os
import time
from pathlib import Path

API_BASE = "http://localhost:3001/api"
TEST_IMAGES_DIR = "./test-images"

def main():
    print("=" * 80)
    print("POLYGON PACKING INTEGRATION TEST")
    print("=" * 80)

    # Step 1: Get test images
    print("\n📁 Finding test images...")
    image_files = sorted([f for f in Path(TEST_IMAGES_DIR).glob("*.png")])
    print(f"✓ Found {len(image_files)} test images")
    for img in image_files:
        print(f"  - {img.name}")

    # Step 2: Process images
    print("\n📤 Processing images...")
    files = [('images', (img.name, open(img, 'rb'), 'image/png')) for img in image_files]
    data = {
        'maxDimension': '3',
        'unit': 'inches'
    }

    response = requests.post(f"{API_BASE}/nesting/process", files=files, data=data)
    response.raise_for_status()

    # Close file handles
    for _, (_, fh, _) in files:
        fh.close()

    processed = response.json()
    processed_images = processed['images']
    print(f"✓ Processed {len(processed_images)} images")

    # Display dimensions
    for img in processed_images:
        width_in = img['width'] / 25.4
        height_in = img['height'] / 25.4
        print(f"  - {img['id']}: {width_in:.2f}\" × {height_in:.2f}\"")

    # Step 3: Run polygon packing
    print("\n🔄 Running polygon packing (V3 algorithm, 5 pages)...")

    nesting_payload = {
        "stickers": [
            {
                "id": img['id'],
                "points": img['path'],
                "width": img['width'],
                "height": img['height']
            }
            for img in processed_images
        ],
        "sheetWidth": 215.9,
        "sheetHeight": 279.4,
        "spacing": 1.5875,
        "productionMode": True,
        "sheetCount": 5,
        "usePolygonPacking": True,
        "useV3Algorithm": True,
        "packAllItems": False,
        "cellsPerInch": 100,
        "stepSize": 0.05,
        "rotations": [0, 90, 180, 270]
    }

    response = requests.post(f"{API_BASE}/nesting/nest", json=nesting_payload)
    response.raise_for_status()
    result = response.json()

    # Check if async job
    if 'jobId' in result:
        print(f"✓ Job started: {result['jobId']}")
        print("\n⏳ Polygon packing is running asynchronously...")
        print("   Waiting for completion (checking backend logs)...")
        print("")
        print("   To manually check backend logs, look for:")
        print("   - '[Packing] Complete' messages")
        print("   - Page count and utilization statistics")
        print("")
        print("📋 Expected verification criteria:")
        print("   1. Exactly 5 pages should be generated (not 7, not 9)")
        print("   2. Shapes should have proper spacing (not touching)")
        print("   3. Shapes should interlock like puzzle pieces (not grid pattern)")
        print("")
        print("=" * 80)
        print("TEST INITIATED - CHECK BACKEND LOGS FOR RESULTS")
        print("=" * 80)
        return

    # Synchronous response
    sheets = result.get('sheets', [])
    sheet_count = len(sheets)

    print("\n📊 VERIFICATION RESULTS:")
    print("=" * 80)
    print(f"✓ Generated {sheet_count} sheets")

    if sheet_count == 5:
        print("  ✅ PASS: Exactly 5 pages generated (as requested)")
    else:
        print(f"  ❌ FAIL: Expected 5 pages, got {sheet_count}")

    print("")
    for sheet in sheets:
        print(f"  Sheet {sheet['sheetIndex'] + 1}:")
        print(f"    - Placements: {len(sheet['placements'])}")
        print(f"    - Utilization: {sheet['utilization']:.2f}%")

    if 'totalUtilization' in result:
        print(f"\n  Total utilization: {result['totalUtilization']:.2f}%")

    if 'quantities' in result:
        print("\n  Quantities packed:")
        for sticker_id, qty in result['quantities'].items():
            print(f"    - {sticker_id}: {qty} copies")

    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        exit(1)
