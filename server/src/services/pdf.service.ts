import PDFDocument from 'pdfkit';
import { Placement, Sticker, SheetPlacement } from './nesting.service';

export class PdfService {
  /**
   * Generate PDF with sticker layout
   */
  async generatePdf(
    stickers: Map<string, Sticker & { imageBuffer: Buffer }>,
    placements: Placement[],
    sheetWidth: number,
    sheetHeight: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Convert to PDF points (72 DPI)
        const widthPoints = sheetWidth * 72;
        const heightPoints = sheetHeight * 72;

        const doc = new PDFDocument({
          size: [widthPoints, heightPoints],
          margin: 0
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Draw each placement
        placements.forEach(placement => {
          const sticker = stickers.get(placement.id);
          if (!sticker) return;

          const xPoints = placement.x * 72;
          const yPoints = placement.y * 72;
          const wPoints = sticker.width * 72;
          const hPoints = sticker.height * 72;

          // Draw image with rotation support
          try {
            // STRICT STATE ISOLATION: Save state before any transformations
            doc.save();

            // Step 1: Translate to placement position (absolute from packer)
            doc.translate(xPoints, yPoints);

            // Step 2: Handle rotation with center-based pivot
            if (placement.rotation && placement.rotation !== 0) {
              const is90DegRotation = Math.abs(Math.abs(placement.rotation) - 90) < 0.1;

              if (is90DegRotation) {
                // For 90-degree rotations: rotate around center of ROTATED bounding box
                // Rotated box dimensions are swapped: hPoints × wPoints
                // Center of rotated box is at (hPoints/2, wPoints/2) from placement origin
                doc.translate(hPoints / 2, wPoints / 2);
                doc.rotate(placement.rotation, { origin: [0, 0] });

                // Draw image centered using ORIGINAL dimensions
                doc.image(sticker.imageBuffer, -wPoints / 2, -hPoints / 2, {
                  width: wPoints,
                  height: hPoints
                });

                // Draw cut line (red)
                if (sticker.points && sticker.points.length > 0) {
                  doc.strokeColor('red');
                  doc.lineWidth(0.5);

                  const scaledPoints = sticker.points.map(p => ({
                    x: (p.x / sticker.width) * wPoints - wPoints / 2,
                    y: (p.y / sticker.height) * hPoints - hPoints / 2
                  }));

                  doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                  for (let i = 1; i < scaledPoints.length; i++) {
                    doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                  }
                  doc.closePath();
                  doc.stroke();
                }
              } else {
                // For arbitrary angles: rotate around center normally
                doc.translate(wPoints / 2, hPoints / 2);
                doc.rotate(placement.rotation, { origin: [0, 0] });

                // Draw image offset by negative half dimensions (no swap for non-90° rotations)
                doc.image(sticker.imageBuffer, -wPoints / 2, -hPoints / 2, {
                  width: wPoints,
                  height: hPoints
                });

                // Draw cut line (red)
                if (sticker.points && sticker.points.length > 0) {
                  doc.strokeColor('red');
                  doc.lineWidth(0.5);

                  const scaledPoints = sticker.points.map(p => ({
                    x: (p.x / sticker.width) * wPoints - wPoints / 2,
                    y: (p.y / sticker.height) * hPoints - hPoints / 2
                  }));

                  doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                  for (let i = 1; i < scaledPoints.length; i++) {
                    doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                  }
                  doc.closePath();
                  doc.stroke();
                }
              }
            } else {
              // No rotation: Draw at origin (0, 0)
              doc.image(sticker.imageBuffer, 0, 0, {
                width: wPoints,
                height: hPoints
              });

              // Draw cut line (red)
              if (sticker.points && sticker.points.length > 0) {
                doc.strokeColor('red');
                doc.lineWidth(0.5);

                const scaledPoints = sticker.points.map(p => ({
                  x: (p.x / sticker.width) * wPoints,
                  y: (p.y / sticker.height) * hPoints
                }));

                doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                for (let i = 1; i < scaledPoints.length; i++) {
                  doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                }
                doc.closePath();
                doc.stroke();
              }
            }

            // STRICT STATE ISOLATION: Restore state after rendering this sticker
            doc.restore();
          } catch (err) {
            console.error('Error drawing sticker:', err);
          }
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate multi-page PDF for production mode
   */
  async generateMultiSheetPdf(
    stickers: Map<string, Sticker & { imageBuffer: Buffer }>,
    sheets: SheetPlacement[],
    sheetWidth: number,
    sheetHeight: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Convert to PDF points (72 DPI)
        const widthPoints = sheetWidth * 72;
        const heightPoints = sheetHeight * 72;

        const doc = new PDFDocument({
          size: [widthPoints, heightPoints],
          margin: 0
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Draw each sheet as a separate page
        sheets.forEach((sheet, sheetIndex) => {
          if (sheetIndex > 0) {
            doc.addPage();
          }

          // Draw placements on this sheet
          if (!sheet.placements || sheet.placements.length === 0) {
            console.warn(`Sheet ${sheetIndex} has no placements`);
            return;
          }

          sheet.placements.forEach(placement => {
            // Extract original sticker ID (remove instance suffix _0, _1, etc.)
            const originalId = placement.id.replace(/_\d+$/, '');
            const sticker = stickers.get(originalId);
            if (!sticker) {
              console.warn(`Sticker not found for placement ID: ${placement.id}, tried: ${originalId}`);
              return;
            }

            const xPoints = placement.x * 72;
            const yPoints = placement.y * 72;
            const wPoints = sticker.width * 72;
            const hPoints = sticker.height * 72;

            // Draw image with rotation support
            try {
              // STRICT STATE ISOLATION: Save state before any transformations
              doc.save();

              // Step 1: Translate to placement position (absolute from packer)
              doc.translate(xPoints, yPoints);

              // Step 2: Handle rotation with center-based pivot
              if (placement.rotation && placement.rotation !== 0) {
                const is90DegRotation = Math.abs(Math.abs(placement.rotation) - 90) < 0.1;

                if (is90DegRotation) {
                  // For 90-degree rotations: rotate around center of ROTATED bounding box
                  // Rotated box dimensions are swapped: hPoints × wPoints
                  // Center of rotated box is at (hPoints/2, wPoints/2) from placement origin
                  doc.translate(hPoints / 2, wPoints / 2);
                  doc.rotate(placement.rotation, { origin: [0, 0] });

                  // Draw image centered using ORIGINAL dimensions
                  doc.image(sticker.imageBuffer, -wPoints / 2, -hPoints / 2, {
                    width: wPoints,
                    height: hPoints
                  });

                  // Draw cut line (red)
                  if (sticker.points && sticker.points.length > 0) {
                    doc.strokeColor('red');
                    doc.lineWidth(0.5);

                    const scaledPoints = sticker.points.map(p => ({
                      x: (p.x / sticker.width) * wPoints - wPoints / 2,
                      y: (p.y / sticker.height) * hPoints - hPoints / 2
                    }));

                    doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                    for (let i = 1; i < scaledPoints.length; i++) {
                      doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                    }
                    doc.closePath();
                    doc.stroke();
                  }
                } else {
                  // For arbitrary angles: rotate around center normally
                  doc.translate(wPoints / 2, hPoints / 2);
                  doc.rotate(placement.rotation, { origin: [0, 0] });

                  // Draw image offset by negative half dimensions (no swap for non-90° rotations)
                  doc.image(sticker.imageBuffer, -wPoints / 2, -hPoints / 2, {
                    width: wPoints,
                    height: hPoints
                  });

                  // Draw cut line (red)
                  if (sticker.points && sticker.points.length > 0) {
                    doc.strokeColor('red');
                    doc.lineWidth(0.5);

                    const scaledPoints = sticker.points.map(p => ({
                      x: (p.x / sticker.width) * wPoints - wPoints / 2,
                      y: (p.y / sticker.height) * hPoints - hPoints / 2
                    }));

                    doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                    for (let i = 1; i < scaledPoints.length; i++) {
                      doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                    }
                    doc.closePath();
                    doc.stroke();
                  }
                }
              } else {
                // No rotation: Draw at origin (0, 0)
                doc.image(sticker.imageBuffer, 0, 0, {
                  width: wPoints,
                  height: hPoints
                });

                // Draw cut line (red)
                if (sticker.points && sticker.points.length > 0) {
                  doc.strokeColor('red');
                  doc.lineWidth(0.5);

                  const scaledPoints = sticker.points.map(p => ({
                    x: (p.x / sticker.width) * wPoints,
                    y: (p.y / sticker.height) * hPoints
                  }));

                  doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                  for (let i = 1; i < scaledPoints.length; i++) {
                    doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                  }
                  doc.closePath();
                  doc.stroke();
                }
              }

              // STRICT STATE ISOLATION: Restore state after rendering this sticker
              doc.restore();
            } catch (err) {
              console.error('Error drawing sticker:', err);
            }
          });
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
