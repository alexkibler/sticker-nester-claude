import { Router, Request, Response } from 'express';
import { upload } from '../config/multer';
import { ImageService } from '../services/image.service';
import { GeometryService } from '../services/geometry.service';
import { NestingService } from '../services/nesting.service';
import { WorkerManagerService } from '../services/worker-manager.service';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

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
 * For polygon packing, uses worker threads and Socket.IO for progress updates
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
      useV2Algorithm = false,    // Use V2 algorithm (Bottom-Left, deprecated)
      useV3Algorithm = true,     // Use V3 algorithm (TRUE NESTING with gravity) - DEFAULT
      rotationPreset,            // Rotation preset: '90', '45', '15', '10', '5' (optional)
      cellsPerInch,              // Grid resolution for polygon packing (optional, derived from preset)
      stepSize,                  // Position search step size for polygon packing (optional, derived from preset)
      rotations,                 // Rotation angles to try in degrees (optional, derived from preset)
      packAllItems = true,       // Smart packing: true = auto-expand pages, false = fixed pages with fail-fast
      socketId = null            // Socket ID for real-time progress updates
    } = req.body;

    // Convert rotationPreset to actual parameters if provided
    let finalRotations = rotations || [0, 90, 180, 270];
    let finalCellsPerInch = cellsPerInch || 100;
    let finalStepSize = stepSize || 0.05;

    if (rotationPreset) {
      // Map preset to optimized parameters
      switch (rotationPreset) {
        case '90':
          finalRotations = [0, 90, 180, 270];
          finalCellsPerInch = 100;
          finalStepSize = 0.05;
          break;
        case '45':
          finalRotations = [0, 45, 90, 135, 180, 225, 270, 315];
          finalCellsPerInch = 75;
          finalStepSize = 0.075;
          break;
        case '15':
          finalRotations = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];
          finalCellsPerInch = 50;
          finalStepSize = 0.1;
          break;
        case '10':
          finalRotations = Array.from({ length: 36 }, (_, i) => i * 10);
          finalCellsPerInch = 50;
          finalStepSize = 0.1;
          break;
        case '5':
          finalRotations = Array.from({ length: 72 }, (_, i) => i * 5);
          finalCellsPerInch = 40;
          finalStepSize = 0.15;
          break;
        default:
          // Use provided rotations or default
          break;
      }
    }

    if (!stickers || stickers.length === 0 || !sheetWidth || !sheetHeight) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const finalSpacing = spacing !== undefined ? spacing : 0.0625;

    // Get Socket.IO and WorkerManager from app.locals
    const io: SocketIOServer = req.app.locals.io;
    const workerManager: WorkerManagerService = req.app.locals.workerManager;

    // If using polygon packing, use worker threads
    if (usePolygonPacking) {
      const jobId = uuidv4();
      console.log(`[Nesting] Starting polygon packing job ${jobId} (socket: ${socketId || 'none'})`);

      // Determine packing type
      const packingType = (productionMode && sheetCount !== undefined) ? 'multi-sheet' : 'single-sheet';

      // Start worker job (non-blocking)
      workerManager.executePackingJob(
        jobId,
        {
          type: packingType,
          stickers,
          sheetWidth,
          sheetHeight,
          spacing: finalSpacing,
          cellsPerInch: finalCellsPerInch,
          stepSize: finalStepSize,
          rotations: finalRotations,
          pageCount: sheetCount,
          packAllItems,
          useV2Algorithm,
          useV3Algorithm
        },
        {
          onProgress: (progress) => {
            // Send progress updates via Socket.IO
            if (socketId && io) {
              io.to(socketId).emit('nesting:progress', {
                jobId,
                ...progress
              });
            }
          },
          onComplete: (result) => {
            // Send completion event via Socket.IO
            if (socketId && io) {
              io.to(socketId).emit('nesting:complete', {
                jobId,
                result
              });
            }
          },
          onError: (error) => {
            // Send error event via Socket.IO
            if (socketId && io) {
              io.to(socketId).emit('nesting:error', {
                jobId,
                error
              });
            }
          }
        }
      ).catch(error => {
        console.error(`[Nesting] Worker job ${jobId} failed:`, error);
      });

      // Return immediately with job ID
      return res.json({
        jobId,
        message: 'Polygon packing started. Listen for progress via Socket.IO.',
        type: packingType
      });
    }

    // For non-polygon packing, use synchronous methods (fast enough)
    if (productionMode && sheetCount !== undefined) {
      const result = nestingService.nestStickersMultiSheet(
        stickers,
        sheetWidth,
        sheetHeight,
        sheetCount,
        finalSpacing
      );
      res.json(result);
    } else {
      const result = nestingService.nestStickers(
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
