import { Router, Request, Response } from 'express';
import { upload } from '../index';
import { ImageService } from '../services/image.service';
import { GeometryService } from '../services/geometry.service';
import { NestingService, Sticker } from '../services/nesting.service';

const router = Router();
const imageService = new ImageService();
const geometryService = new GeometryService();
const nestingService = new NestingService();

/**
 * Process uploaded images and return traced paths
 */
router.post('/process', upload.array('images', 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const processed = await Promise.all(
      files.map(async (file) => {
        const { path, width, height } = await imageService.processImage(file.buffer);
        const simplified = geometryService.simplifyPath(path, 2.0);

        return {
          id: file.originalname,
          path: simplified,
          width: width / 300, // Convert pixels to inches at 300 DPI
          height: height / 300
        };
      })
    );

    res.json({ stickers: processed });
  } catch (error: any) {
    console.error('Error processing images:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Run nesting algorithm
 */
router.post('/nest', async (req: Request, res: Response) => {
  try {
    const { stickers, sheetWidth, sheetHeight, spacing } = req.body;

    if (!stickers || !sheetWidth || !sheetHeight) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const result = nestingService.nestStickers(
      stickers,
      sheetWidth,
      sheetHeight,
      spacing || 0.0625
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error nesting stickers:', error);
    res.status(500).json({ error: error.message });
  }
});

export const nestingRouter = router;
