#!/bin/bash

set -e

API_BASE="http://localhost:3001/api"
TEST_IMAGES_DIR="./test-images"

echo "================================================================================"
echo "POLYGON PACKING INTEGRATION TEST"
echo "================================================================================"

# Step 1: Get test images
echo ""
echo "📁 Finding test images..."
IMAGE_COUNT=$(ls -1 $TEST_IMAGES_DIR/*.png 2>/dev/null | wc -l)
echo "✓ Found $IMAGE_COUNT test images"
ls -1 $TEST_IMAGES_DIR/*.png | sed 's|.*/||' | sed 's/^/  - /'

# Step 2: Build multipart form data for processing
echo ""
echo "📤 Processing images..."

# Create a temporary file for the form data
BOUNDARY="----WebKitFormBoundary$(date +%s)"
TEMP_FILE=$(mktemp)

# Build form data
for IMAGE in $TEST_IMAGES_DIR/*.png; do
  IMAGE_NAME=$(basename "$IMAGE")
  echo "--$BOUNDARY" >> $TEMP_FILE
  echo "Content-Disposition: form-data; name=\"images\"; filename=\"$IMAGE_NAME\"" >> $TEMP_FILE
  echo "Content-Type: image/png" >> $TEMP_FILE
  echo "" >> $TEMP_FILE
  cat "$IMAGE" >> $TEMP_FILE
  echo "" >> $TEMP_FILE
done

echo "--$BOUNDARY" >> $TEMP_FILE
echo "Content-Disposition: form-data; name=\"maxDimension\"" >> $TEMP_FILE
echo "" >> $TEMP_FILE
echo "3" >> $TEMP_FILE
echo "--$BOUNDARY" >> $TEMP_FILE
echo "Content-Disposition: form-data; name=\"unit\"" >> $TEMP_FILE
echo "" >> $TEMP_FILE
echo "inches" >> $TEMP_FILE
echo "--$BOUNDARY--" >> $TEMP_FILE

# Send the request
PROCESS_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: multipart/form-data; boundary=$BOUNDARY" \
  --data-binary "@$TEMP_FILE" \
  "$API_BASE/nesting/process")

rm -f $TEMP_FILE

# Save the processed images data
echo "$PROCESS_RESPONSE" > /tmp/processed-images.json

PROCESSED_COUNT=$(echo "$PROCESS_RESPONSE" | grep -o '"id"' | wc -l)
echo "✓ Processed $PROCESSED_COUNT images"

# Extract sticker data for nesting payload
STICKERS=$(echo "$PROCESS_RESPONSE" | jq -c '.images | map({id: .id, points: .path, width: .width, height: .height})')

# Step 3: Run polygon packing
echo ""
echo "🔄 Running polygon packing (V3 algorithm, 5 pages)..."

NESTING_PAYLOAD=$(cat <<EOF
{
  "stickers": $STICKERS,
  "sheetWidth": 215.9,
  "sheetHeight": 279.4,
  "spacing": 1.5875,
  "productionMode": true,
  "sheetCount": 5,
  "usePolygonPacking": true,
  "useV3Algorithm": true,
  "packAllItems": false,
  "cellsPerInch": 100,
  "stepSize": 0.05,
  "rotations": [0, 90, 180, 270]
}
EOF
)

NESTING_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$NESTING_PAYLOAD" \
  "$API_BASE/nesting/nest")

echo "$NESTING_RESPONSE" > /tmp/nesting-response.json

# Check if it's an async job
JOB_ID=$(echo "$NESTING_RESPONSE" | jq -r '.jobId // empty')

if [ -n "$JOB_ID" ]; then
  echo "✓ Job started: $JOB_ID"
  echo ""
  echo "⏳ Polygon packing is running asynchronously..."
  echo "   Please check the backend logs for progress and completion."
  echo ""
  echo "   To view backend logs:"
  echo "   - Watch for 'Packing complete' messages"
  echo "   - Look for page count, utilization, and quantities"
  echo ""
  echo "📋 Expected verification criteria:"
  echo "   1. Exactly 5 pages should be generated (not 7, not 9)"
  echo "   2. Shapes should have proper spacing (not touching)"
  echo "   3. Shapes should interlock like puzzle pieces (not grid pattern)"
  echo ""
else
  # Synchronous response
  SHEET_COUNT=$(echo "$NESTING_RESPONSE" | jq '.sheets | length // 0')

  echo ""
  echo "📊 VERIFICATION RESULTS:"
  echo "================================================================================"
  echo "✓ Generated $SHEET_COUNT sheets"

  if [ "$SHEET_COUNT" -eq 5 ]; then
    echo "  ✅ PASS: Exactly 5 pages generated (as requested)"
  else
    echo "  ❌ FAIL: Expected 5 pages, got $SHEET_COUNT"
  fi

  echo ""
  echo "$NESTING_RESPONSE" | jq -r '.sheets[] | "  Sheet \(.sheetIndex + 1): \(.placements | length) placements, \(.utilization)% utilization"'

  TOTAL_UTIL=$(echo "$NESTING_RESPONSE" | jq -r '.totalUtilization')
  echo ""
  echo "  Total utilization: $TOTAL_UTIL%"

  echo ""
  echo "  Quantities:"
  echo "$NESTING_RESPONSE" | jq -r '.quantities | to_entries[] | "    - \(.key): \(.value) copies"'
fi

echo ""
echo "================================================================================"
echo "TEST COMPLETE"
echo "================================================================================"
