import request from 'supertest';
import express, { Express } from 'express';
import cors from 'cors';
import { nestingRouter } from '../routes/nesting.routes';
import { pdfRouter } from '../routes/pdf.routes';
import sharp from 'sharp';

describe('API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    // Create Express app with same configuration as main server
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/nesting', nestingRouter);
    app.use('/api/pdf', pdfRouter);
  });

  describe('POST /api/nesting/process', () => {
    it('should process uploaded images', async () => {
      // Create a test image
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const response = await request(app)
        .post('/api/nesting/process')
        .attach('images', testImage, 'test.png')
        .expect(200);

      expect(response.body).toHaveProperty('images');
      expect(Array.isArray(response.body.images)).toBe(true);
      expect(response.body.images.length).toBe(1);

      const processedImage = response.body.images[0];
      expect(processedImage).toHaveProperty('id');
      expect(processedImage).toHaveProperty('path');
      expect(processedImage).toHaveProperty('width');
      expect(processedImage).toHaveProperty('height');

      expect(Array.isArray(processedImage.path)).toBe(true);
      expect(processedImage.width).toBeGreaterThan(0);
      expect(processedImage.height).toBeGreaterThan(0);
    });

    it('should handle multiple images', async () => {
      const testImage1 = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const testImage2 = await sharp({
        create: {
          width: 75,
          height: 75,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const response = await request(app)
        .post('/api/nesting/process')
        .attach('images', testImage1, 'test1.png')
        .attach('images', testImage2, 'test2.png')
        .expect(200);

      expect(response.body.images.length).toBe(2);
    });

    it('should return 400 if no images provided', async () => {
      await request(app).post('/api/nesting/process').expect(400);
    });
  });

  describe('POST /api/nesting/nest', () => {
    it('should nest stickers', async () => {
      const requestBody = {
        stickers: [
          {
            id: 'sticker-1',
            points: [
              { x: 0, y: 0 },
              { x: 2, y: 0 },
              { x: 2, y: 2 },
              { x: 0, y: 2 },
            ],
            width: 2,
            height: 2,
          },
          {
            id: 'sticker-2',
            points: [
              { x: 0, y: 0 },
              { x: 2, y: 0 },
              { x: 2, y: 2 },
              { x: 0, y: 2 },
            ],
            width: 2,
            height: 2,
          },
        ],
        sheetWidth: 12,
        sheetHeight: 12,
        spacing: 0.0625,
      };

      const response = await request(app)
        .post('/api/nesting/nest')
        .send(requestBody)
        .expect(200);

      expect(response.body).toHaveProperty('placements');
      expect(response.body).toHaveProperty('utilization');
      expect(response.body).toHaveProperty('fitness');

      expect(Array.isArray(response.body.placements)).toBe(true);
      expect(response.body.placements.length).toBe(2);

      response.body.placements.forEach((placement: any) => {
        expect(placement).toHaveProperty('id');
        expect(placement).toHaveProperty('x');
        expect(placement).toHaveProperty('y');
        expect(placement).toHaveProperty('rotation');
      });

      expect(response.body.utilization).toBeGreaterThan(0);
      expect(response.body.utilization).toBeLessThanOrEqual(100);
    });

    it('should return 400 if stickers array is empty', async () => {
      const requestBody = {
        stickers: [],
        sheetWidth: 12,
        sheetHeight: 12,
        spacing: 0.0625,
      };

      await request(app).post('/api/nesting/nest').send(requestBody).expect(400);
    });

    it('should return 400 if required fields are missing', async () => {
      const requestBody = {
        stickers: [
          {
            id: 'sticker-1',
            points: [{ x: 0, y: 0 }],
            width: 2,
            height: 2,
          },
        ],
        // Missing sheetWidth and sheetHeight
        spacing: 0.0625,
      };

      await request(app).post('/api/nesting/nest').send(requestBody).expect(400);
    });
  });

  describe('POST /api/pdf/generate', () => {
    it('should generate PDF', async () => {
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const placements = JSON.stringify([
        {
          id: 'test.png',
          x: 1,
          y: 1,
          rotation: 0,
        },
      ]);

      const stickers = JSON.stringify([
        {
          id: 'test.png',
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          width: 1,
          height: 1,
        },
      ]);

      const response = await request(app)
        .post('/api/pdf/generate')
        .field('placements', placements)
        .field('stickers', stickers)
        .field('sheetWidth', '12')
        .field('sheetHeight', '12')
        .attach('images', testImage, 'test.png')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);

      // PDF files start with %PDF
      expect(response.body.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should return 400 if no images provided', async () => {
            await request(app)
              .post('/api/pdf/generate')
              .field('sheetWidth', '12')
              .field('sheetHeight', '12')
              .expect(400);
    });

    it('should return 400 if placements are missing', async () => {
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const stickers = JSON.stringify([
        {
          id: 'test.png',
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          width: 1,
          height: 1,
        },
      ]);

      await request(app)
        .post('/api/pdf/generate')
        .field('stickers', stickers)
        .field('sheetWidth', '12')
        .field('sheetHeight', '12')
        .attach('images', testImage, 'test.png')
        .expect(400);
    });
  });

  describe('Known Optimal Solution Test', () => {
    it('should achieve ~100% utilization for perfect rectangle packing', async () => {
      // Test case: Four 1x1 inch squares should fit perfectly in a 2x2 inch sheet
      // This is a known optimal solution with 100% utilization
      const stickers = Array.from({ length: 4 }, (_, i) => ({
        id: `square-${i}`,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        width: 1,
        height: 1,
      }));

      const response = await request(app)
        .post('/api/nesting/nest')
        .send({
          stickers,
          sheetWidth: 2,
          sheetHeight: 2,
          spacing: 0, // No spacing for perfect fit
        })
        .expect(200);

      // All 4 squares should be placed
      expect(response.body.placements).toHaveLength(4);

      // Utilization should be 100% (or very close due to floating point)
      expect(response.body.utilization).toBeGreaterThan(99);
      expect(response.body.utilization).toBeLessThanOrEqual(100);

      // Fitness should equal total area (4 * 1 = 4)
      expect(response.body.fitness).toBe(4);
    });

    it('should achieve high utilization for six 2x4 rectangles in 12x12 sheet', async () => {
      // Test case: Six 2x4 inch rectangles (48 sq in total)
      // in a 12x12 sheet (144 sq in)
      // Expected utilization: ~33% (48/144)
      const stickers = Array.from({ length: 6 }, (_, i) => ({
        id: `rect-${i}`,
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 4 },
          { x: 0, y: 4 },
        ],
        width: 2,
        height: 4,
      }));

      const response = await request(app)
        .post('/api/nesting/nest')
        .send({
          stickers,
          sheetWidth: 12,
          sheetHeight: 12,
          spacing: 0,
        })
        .expect(200);

      // All 6 rectangles should fit
      expect(response.body.placements).toHaveLength(6);

      // Utilization should be around 33%
      expect(response.body.utilization).toBeGreaterThan(30);
      expect(response.body.utilization).toBeLessThan(35);
    });
  });
});
