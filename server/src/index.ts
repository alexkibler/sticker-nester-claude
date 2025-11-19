import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { nestingRouter } from './routes/nesting.routes';
import { pdfRouter } from './routes/pdf.routes';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/nesting', nestingRouter);
app.use('/api/pdf', pdfRouter);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Mosaic API is running' });
});

// Serve static files from Angular frontend (production mode)
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// All non-API routes should serve the Angular app
app.get('*', (req: Request, res: Response) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error occurred:', err);

  // Handle Multer errors specifically
  if (err instanceof multer.MulterError) {
    console.error('Multer Error Details:');
    console.error('- Error code:', err.code);
    console.error('- Field name:', err.field);
    console.error('- Request path:', req.path);
    console.error('- Request method:', req.method);
    console.error('- Content-Type:', req.headers['content-type']);

    return res.status(400).json({
      error: 'File upload error',
      message: err.message,
      code: err.code,
      field: err.field
    });
  }

  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`⚡️ Server is running on port ${PORT}`);
  console.log(`🎨 Mosaic API ready at http://localhost:${PORT}/api`);
});

export default app;
