import { Router, Request, Response } from 'express';
import { upload } from '../config/multer';
import { PdfService } from '../services/pdf.service';
import { Sticker } from '../services/nesting.service';

const router = Router();
const pdfService = new PdfService();

/**
 * Generate PDF from placements
 */
router.post('/generate', upload.array('images', 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { placements, sheetWidth, sheetHeight, stickers } = req.body;

    if (!files || !placements || !sheetWidth || !sheetHeight) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Parse JSON data
    const parsedPlacements = JSON.parse(placements);
    const parsedStickers = JSON.parse(stickers);

    // Create sticker map with images
    const stickerMap = new Map<string, Sticker & { imageBuffer: Buffer }>();
    files.forEach((file, index) => {
      const sticker = parsedStickers[index];
      if (sticker) {
        stickerMap.set(sticker.id, {
          ...sticker,
          imageBuffer: file.buffer
        });
      }
    });

    const pdfBuffer = await pdfService.generatePdf(
      stickerMap,
      parsedPlacements,
      parseFloat(sheetWidth),
      parseFloat(sheetHeight)
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sticker-layout.pdf');
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

export const pdfRouter = router;
