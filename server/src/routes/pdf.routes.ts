import { Router, Request, Response } from 'express';
import { upload } from '../config/multer';
import { PdfService } from '../services/pdf.service';
import { Sticker } from '../services/nesting.service';

const router = Router();
const pdfService = new PdfService();

/**
 * Generate PDF from placements
 */
router.post('/generate', upload.array('images', 100), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { placements, sheets, sheetWidth, sheetHeight, stickers, productionMode } = req.body;

    const isProductionMode = productionMode === 'true';

    if (!files || !sheetWidth || !sheetHeight || !stickers) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (isProductionMode && !sheets) {
      return res.status(400).json({ error: 'Missing required "sheets" parameter for production mode' });
    }

    if (!isProductionMode && !placements) {
      return res.status(400).json({ error: 'Missing required "placements" parameter' });
    }

    // Parse JSON data
    const parsedStickers = JSON.parse(stickers);

    // Create sticker map with images
    // Files are uploaded with sticker ID as the filename
    const stickerMap = new Map<string, Sticker & { imageBuffer: Buffer }>();
    files.forEach((file) => {
      // The original filename should match a sticker ID
      const sticker = parsedStickers.find((s: any) => s.id === file.originalname);
      if (sticker) {
        stickerMap.set(sticker.id, {
          ...sticker,
          imageBuffer: file.buffer
        });
      } else {
        console.warn(`No sticker found for file: ${file.originalname}`);
      }
    });

    // Set response headers for PDF streaming
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sticker-layout.pdf');

    // Stream PDF directly to response (memory-efficient, prevents OOM on large PDFs)
    if (isProductionMode && sheets) {
      // Multi-sheet PDF generation (optimized for 50+ pages)
      const parsedSheets = JSON.parse(sheets);
      console.log(`Generating multi-sheet PDF: ${parsedSheets.length} pages (streaming mode)`);
      await pdfService.generateMultiSheetPdf(
        stickerMap,
        parsedSheets,
        parseFloat(sheetWidth),
        parseFloat(sheetHeight),
        res
      );
    } else {
      // Single sheet PDF generation
      const parsedPlacements = JSON.parse(placements);
      await pdfService.generatePdf(
        stickerMap,
        parsedPlacements,
        parseFloat(sheetWidth),
        parseFloat(sheetHeight),
        res
      );
    }
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

export const pdfRouter = router;
