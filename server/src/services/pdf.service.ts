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
            doc.save();

            // Apply rotation if needed
            if (placement.rotation && placement.rotation !== 0) {
              // Translate to placement position
              doc.translate(xPoints, yPoints);
              // Rotate around origin
              doc.rotate(placement.rotation, { origin: [0, 0] });
              // Draw at origin (already translated)
              doc.image(sticker.imageBuffer, 0, 0, {
                width: wPoints,
                height: hPoints
              });
            } else {
              // No rotation - draw normally
              doc.image(sticker.imageBuffer, xPoints, yPoints, {
                width: wPoints,
                height: hPoints
              });
            }

            // Draw cut line (red)
            if (sticker.points && sticker.points.length > 0) {
              doc.strokeColor('red');
              doc.lineWidth(0.5);

              if (placement.rotation && placement.rotation !== 0) {
                // Rotated - points are already in the transformed space
                const scaledPoints = sticker.points.map(p => ({
                  x: (p.x / sticker.width) * wPoints,
                  y: (p.y / sticker.height) * hPoints
                }));

                doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                for (let i = 1; i < scaledPoints.length; i++) {
                  doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                }
              } else {
                // Not rotated - offset by placement position
                const scaledPoints = sticker.points.map(p => ({
                  x: xPoints + (p.x / sticker.width) * wPoints,
                  y: yPoints + (p.y / sticker.height) * hPoints
                }));

                doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                for (let i = 1; i < scaledPoints.length; i++) {
                  doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                }
              }
              doc.closePath();
              doc.stroke();
            }

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
              doc.save();

              // Apply rotation if needed
              if (placement.rotation && placement.rotation !== 0) {
                // Translate to placement position
                doc.translate(xPoints, yPoints);
                // Rotate around origin
                doc.rotate(placement.rotation, { origin: [0, 0] });
                // Draw at origin (already translated)
                doc.image(sticker.imageBuffer, 0, 0, {
                  width: wPoints,
                  height: hPoints
                });
              } else {
                // No rotation - draw normally
                doc.image(sticker.imageBuffer, xPoints, yPoints, {
                  width: wPoints,
                  height: hPoints
                });
              }

              // Draw cut line (red)
              if (sticker.points && sticker.points.length > 0) {
                doc.strokeColor('red');
                doc.lineWidth(0.5);

                if (placement.rotation && placement.rotation !== 0) {
                  // Rotated - points are already in the transformed space
                  const scaledPoints = sticker.points.map(p => ({
                    x: (p.x / sticker.width) * wPoints,
                    y: (p.y / sticker.height) * hPoints
                  }));

                  doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                  for (let i = 1; i < scaledPoints.length; i++) {
                    doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                  }
                } else {
                  // Not rotated - offset by placement position
                  const scaledPoints = sticker.points.map(p => ({
                    x: xPoints + (p.x / sticker.width) * wPoints,
                    y: yPoints + (p.y / sticker.height) * hPoints
                  }));

                  doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                  for (let i = 1; i < scaledPoints.length; i++) {
                    doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                  }
                }
                doc.closePath();
                doc.stroke();
              }

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
