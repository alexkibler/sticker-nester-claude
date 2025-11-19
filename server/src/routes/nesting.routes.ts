import { Router, Request, Response } from 'express';
import { upload } from '../config/multer';
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
        const { path } = await imageService.processImage(file.buffer);
        const simplified = geometryService.simplifyPath(path, 2.0);

        // Calculate bounding box of the traced path (ignoring transparent background)
        const bbox = geometryService.getBoundingBox(simplified);

        // Normalize path coordinates relative to bounding box origin
        // and convert to inches (300 DPI)
        const normalizedPath = simplified.map(p => ({
          x: (p.x - bbox.minX) / 300,
          y: (p.y - bbox.minY) / 300
        }));

        return {
          id: file.originalname,
          path: normalizedPath,
          width: bbox.width / 300, // Convert pixels to inches at 300 DPI
          height: bbox.height / 300
        };
      })
    );

    res.json({ images: processed });
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
    const { stickers, sheetWidth, sheetHeight, spacing, productionMode, quantities } = req.body;

    if (!stickers || stickers.length === 0 || !sheetWidth || !sheetHeight) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Use multi-sheet nesting if in production mode with quantities
    if (productionMode && quantities) {
      const result = nestingService.nestStickersMultiSheet(
        stickers,
        sheetWidth,
        sheetHeight,
        quantities,
        spacing !== undefined ? spacing : 0.0625
      );
      res.json(result);
    } else {
      const result = nestingService.nestStickers(
        stickers,
        sheetWidth,
        sheetHeight,
        spacing !== undefined ? spacing : 0.0625
      );
      res.json(result);
    }
  } catch (error: any) {
    console.error('Error nesting stickers:', error);
    res.status(500).json({ error: error.message });
  }
});

export const nestingRouter = router;
