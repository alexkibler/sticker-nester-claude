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

          // Draw image
          try {
            doc.image(sticker.imageBuffer, xPoints, yPoints, {
              width: wPoints,
              height: hPoints
            });

            // Draw cut line (red)
            if (sticker.points && sticker.points.length > 0) {
              doc.save();
              doc.strokeColor('red');
              doc.lineWidth(0.5);

              const scaledPoints = sticker.points.map(p => ({
                x: xPoints + (p.x / sticker.width) * wPoints,
                y: yPoints + (p.y / sticker.height) * hPoints
              }));

              doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
              for (let i = 1; i < scaledPoints.length; i++) {
                doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
              }
              doc.closePath();
              doc.stroke();
              doc.restore();
            }
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
            // Extract original sticker ID (remove _copyN suffix)
            const originalId = placement.id.replace(/_copy\d+$/, '');
            const sticker = stickers.get(originalId);
            if (!sticker) return;

            const xPoints = placement.x * 72;
            const yPoints = placement.y * 72;
            const wPoints = sticker.width * 72;
            const hPoints = sticker.height * 72;

            // Draw image
            try {
              doc.image(sticker.imageBuffer, xPoints, yPoints, {
                width: wPoints,
                height: hPoints
              });

              // Draw cut line (red)
              if (sticker.points && sticker.points.length > 0) {
                doc.save();
                doc.strokeColor('red');
                doc.lineWidth(0.5);

                const scaledPoints = sticker.points.map(p => ({
                  x: xPoints + (p.x / sticker.width) * wPoints,
                  y: yPoints + (p.y / sticker.height) * hPoints
                }));

                doc.moveTo(scaledPoints[0].x, scaledPoints[0].y);
                for (let i = 1; i < scaledPoints.length; i++) {
                  doc.lineTo(scaledPoints[i].x, scaledPoints[i].y);
                }
                doc.closePath();
                doc.stroke();
                doc.restore();
              }
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
