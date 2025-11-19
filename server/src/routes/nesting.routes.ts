import { Router, Request, Response } from 'express';
import { upload } from '../config/multer';
import { ImageService } from '../services/image.service';
import { GeometryService } from '../services/geometry.service';
import { NestingService } from '../services/nesting.service';

const router = Router();
const imageService = new ImageService();
const geometryService = new GeometryService();
const nestingService = new NestingService();

/**
 * Process uploaded images and return traced paths
 * Accepts maxDimension and unit parameters to scale all images uniformly
 */
router.post('/process', upload.array('images', 100), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get max dimension and unit from request body (sent as form fields)
    const maxDimension = parseFloat(req.body.maxDimension) || 3;
    const unit = req.body.unit || 'inches';
    const MM_PER_INCH = 25.4;

    // Convert max dimension to mm for internal processing
    const targetMaxMM = unit === 'inches' ? maxDimension * MM_PER_INCH : maxDimension;

    const processed = await Promise.all(
      files.map(async (file) => {
        const { path } = await imageService.processImage(file.buffer);
        const simplified = geometryService.simplifyPath(path, 2.0);

        // Calculate bounding box of the traced path (ignoring transparent background)
        const bbox = geometryService.getBoundingBox(simplified);

        // Convert bounding box to millimeters (300 DPI -> pixels to inches -> inches to mm)
        const MM_PER_INCH = 25.4;
        const widthMM = (bbox.width / 300) * MM_PER_INCH;
        const heightMM = (bbox.height / 300) * MM_PER_INCH;

        // Scale image so largest dimension equals the user-specified max
        const maxDimensionMM = Math.max(widthMM, heightMM);
        const scaleFactor = targetMaxMM / maxDimensionMM;

        // Calculate final dimensions in mm
        const finalWidthMM = widthMM * scaleFactor;
        const finalHeightMM = heightMM * scaleFactor;

        // Normalize path coordinates relative to bounding box origin,
        // convert to mm (300 DPI -> inches -> mm), and apply scale factor
        const normalizedPath = simplified.map(p => ({
          x: (((p.x - bbox.minX) / 300) * MM_PER_INCH) * scaleFactor,
          y: (((p.y - bbox.minY) / 300) * MM_PER_INCH) * scaleFactor
        }));

        return {
          id: file.originalname,
          path: normalizedPath,
          width: finalWidthMM,
          height: finalHeightMM
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
 * Supports both rectangle-based (MaxRects) and polygon-based (rasterization overlay) packing
 */
router.post('/nest', async (req: Request, res: Response) => {
  try {
    const {
      stickers,
      sheetWidth,
      sheetHeight,
      spacing,
      productionMode,
      sheetCount,
      usePolygonPacking = false, // New parameter: use polygon packing instead of rectangle packing
      cellsPerInch = 100,         // Grid resolution for polygon packing
      stepSize = 0.05             // Position search step size for polygon packing
    } = req.body;

    if (!stickers || stickers.length === 0 || !sheetWidth || !sheetHeight) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const finalSpacing = spacing !== undefined ? spacing : 0.0625;

    // Use multi-sheet nesting if in production mode with sheetCount specified
    if (productionMode && sheetCount !== undefined) {
      const result = usePolygonPacking
        ? nestingService.nestStickersMultiSheetPolygon(
            stickers,
            sheetWidth,
            sheetHeight,
            sheetCount,
            finalSpacing,
            cellsPerInch,
            stepSize
          )
        : nestingService.nestStickersMultiSheet(
            stickers,
            sheetWidth,
            sheetHeight,
            sheetCount,
            finalSpacing
          );
      res.json(result);
    } else {
      const result = usePolygonPacking
        ? nestingService.nestStickersPolygon(
            stickers,
            sheetWidth,
            sheetHeight,
            finalSpacing,
            cellsPerInch,
            stepSize
          )
        : nestingService.nestStickers(
            stickers,
            sheetWidth,
            sheetHeight,
            finalSpacing
          );
      res.json(result);
    }
  } catch (error: any) {
    console.error('Error nesting stickers:', error);
    res.status(500).json({ error: error.message });
  }
});

export const nestingRouter = router;
