# Sticker Nester - Client-Side Sticker Layout and Nesting Engine

A fully client-side Angular application for optimizing irregular sticker layouts on print sheets. This tool uses genetic algorithms and Web Workers to efficiently pack custom sticker shapes, minimizing material waste for small business print production.

## Features

- **100% Client-Side Processing** - All computation happens in your browser, no server required
- **Intelligent Nesting Algorithm** - Uses genetic algorithm with NFP (No Fit Polygon) concepts for optimal packing
- **Raster to Vector Conversion** - Automatically traces uploaded images to vector paths
- **High-Resolution PDF Output** - Generates production-ready PDFs with cut lines at 300 DPI
- **Web Worker Architecture** - Non-blocking UI during intensive calculations
- **Support for Irregular Shapes** - Handles complex, concave polygons
- **Rotation Options** - Configure allowed rotations (0°, 90°, 180°, 270°)
- **Configurable Margins & Spacing** - Control bleed and part spacing
- **Real-Time Preview** - See your layout optimize in real-time

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
ng serve

# Navigate to http://localhost:4200
```

### Production Build

```bash
# Build for production
ng build

# Output will be in dist/sticker-nesting
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Application will be available at http://localhost:8080
```

### Docker Manual Build

```bash
# Build image
docker build -t sticker-nester .

# Run container
docker run -p 8080:80 sticker-nester
```

## Usage

1. **Upload Sticker Images** - Drag and drop PNG/JPG images with transparent backgrounds
2. **Configure Settings**:
   - Sheet size (width × height in inches)
   - Margin/bleed (in inches)
   - Spacing between stickers
   - Rotation options
   - Algorithm parameters (population size, mutation rate)
3. **Run Nesting** - Click "Start Nesting" to begin optimization
4. **Watch Progress** - View real-time updates showing generation, fitness, and utilization
5. **Export PDF** - Download production-ready PDF with images and cut lines

## Architecture

Built following a comprehensive architectural specification that includes:

- **Angular Framework** with Signals for reactive state management
- **Web Workers** for concurrent nesting computation
- **ImageTracerJS** for raster-to-vector conversion
- **SimplifyJS** for polygon simplification
- **ClipperLib** for polygon offsetting (margins/bleed)
- **PDFKit** for production-ready PDF generation

## Testing

```bash
# Run unit tests
ng test

# Build the application
ng build
```

## Project Structure

```
src/
├── app/
│   ├── components/        # UI components
│   ├── models/           # TypeScript interfaces
│   ├── services/         # Business logic services
│   ├── workers/          # Web Workers
│   └── app.ts            # Main component
└── styles.scss          # Global styles
```

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires Web Worker support)

Requires modern browser with:
- Web Workers API
- ImageBitmap API
- Canvas API
- File API

## License

Open Source - MIT License

## Acknowledgments

Based on architectural research of:
- SVGNest - Open source nesting algorithm
- ImageTracerJS - Bitmap vectorization
- ClipperLib - Polygon clipping and offsetting
- PDFKit - PDF generation library

---

Built with Angular • Powered by Web Workers • Zero Backend Required
