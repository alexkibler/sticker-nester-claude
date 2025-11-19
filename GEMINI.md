# GEMINI.md

## Project Overview

This is a full-stack web application for optimizing sticker layouts on print sheets. The project consists of an Angular frontend and a Node.js/Express backend.

**Frontend:**
- **Framework:** Angular 20+ with Signals for reactive state management.
- **Features:** Drag & drop image upload, real-time layout preview, configurable settings, and a non-blocking UI using web workers.
- **Key Libraries:** RxJS, ImageTracerJS, jsPDF, ClipperJS, and SimplifyJS.

**Backend:**
- **Framework:** Node.js with Express.
- **Features:** RESTful API for image processing, nesting, and PDF generation. It handles raster-to-vector conversion, intelligent nesting using a greedy algorithm, and high-resolution PDF export with cut lines.
- **Key Libraries:** Sharp, ImageTracerJS, ClipperLib, PDFKit, Multer, and Jest for testing.

**Architecture:**
The frontend and backend are in separate directories (`src` and `server` respectively), each with its own `package.json` and dependencies. The Angular app proxies API requests to the backend. The entire application can be deployed using Docker.

## Building and Running

### Development

**1. Install Dependencies:**
- **Frontend:** `npm install`
- **Backend:** `cd server && npm install`

**2. Run Development Servers:**
- **Backend (port 3001):** `cd server && npm run dev`
- **Frontend (port 4201):** `npm start`

### Production

**1. Build for Production:**
- **Frontend:** `npm run build`
- **Backend:** `cd server && npm run build`

**2. Run Production Build:**
- `cd server && npm start`

### Docker

- **Using Docker Compose:** `docker-compose up -d` (application will be available at http://localhost:8080)
- **Manual Build:** `docker build -t mosaic .` and then `docker run -p 8080:80 mosaic`

## Testing

### Backend

- **Run all tests:** `cd server && npm test`
- **Run tests in watch mode:** `cd server && npm run test:watch`
- **Generate coverage report:** `cd server && npm run test:coverage`

### Frontend

- **Run unit tests:** `npm test`
- **Run tests in watch mode:** `npm run watch`

## Development Conventions

- The project uses Prettier for code formatting.
- The backend has a suite of unit and integration tests written with Jest.
- The frontend uses Karma and Jasmine for testing.
- The project follows a conventional commit message format.
