import { NestingService, Sticker } from '../services/nesting.service';

describe('PetalerLogo Collision Bug', () => {
  let service: NestingService;

  beforeEach(() => {
    service = new NestingService();
  });

  it('should not allow PetalerLogo instances to overlap', () => {
    // Exact dimensions from verification report
    const petalerLogo: Sticker = {
      id: 'PetalerLogo FinalwithStroke.png',
      points: [], // Not needed for collision test
      width: 2.674,
      height: 3.000,
    };

    // Create 20 instances (simulating uploading twice)
    const stickers: Sticker[] = Array(20).fill(petalerLogo);

    // 5 sheets, spacing 0.0625 (from verification report)
    const result = service.nestStickersMultiSheet(
      stickers,
      12,
      12,
      5,
      0.0625
    );

    // Check all placements for overlaps
    result.sheets.forEach((sheet, sheetIndex) => {
      const placements = sheet.placements;

      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          const p1 = placements[i];
          const p2 = placements[j];

          // Calculate bounding boxes (accounting for rotation)
          const getBox = (p: typeof p1) => {
            const w = p.rotation === 90 ? petalerLogo.height : petalerLogo.width;
            const h = p.rotation === 90 ? petalerLogo.width : petalerLogo.height;
            return {
              minX: p.x,
              minY: p.y,
              maxX: p.x + w,
              maxY: p.y + h,
            };
          };

          const box1 = getBox(p1);
          const box2 = getBox(p2);

          // Check for overlap with small epsilon for floating point
          const EPSILON = 0.001;
          const overlapX = !(box1.maxX <= box2.minX + EPSILON || box2.maxX <= box1.minX + EPSILON);
          const overlapY = !(box1.maxY <= box2.minY + EPSILON || box2.maxY <= box1.minY + EPSILON);
          const hasOverlap = overlapX && overlapY;

          if (hasOverlap) {
            const overlapInfo = {
              sheet: sheetIndex,
              placement1: { ...p1, box: box1 },
              placement2: { ...p2, box: box2 },
              overlapX: {
                min: Math.max(box1.minX, box2.minX),
                max: Math.min(box1.maxX, box2.maxX),
              },
              overlapY: {
                min: Math.max(box1.minY, box2.minY),
                max: Math.min(box1.maxY, box2.maxY),
              },
            };

            console.error('COLLISION DETECTED:', JSON.stringify(overlapInfo, null, 2));
            fail(`Overlap detected on sheet ${sheetIndex} between ${p1.id} and ${p2.id}`);
          }
        }
      }
    });

    console.log('✅ No overlaps detected across all sheets');
  });
});
