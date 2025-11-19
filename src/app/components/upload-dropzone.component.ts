import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StickerInput } from '../models';

/**
 * UploadDropzoneComponent handles file uploads
 *
 * Features:
 * - Drag and drop support
 * - File input fallback
 * - Image validation
 * - Multiple file upload
 */
@Component({
  selector: 'app-upload-dropzone',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-container">
      <div
        class="dropzone"
        [class.dragover]="isDragOver"
        (drop)="onDrop($event)"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (click)="fileInput.click()"
      >
        <div class="dropzone-content">
          <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <h3>Upload Sticker Images</h3>
          <p>Drag and drop images here or click to browse</p>
          <p class="hint">Supports PNG, JPG, and GIF with transparent backgrounds</p>
        </div>
      </div>
      <input
        #fileInput
        type="file"
        accept="image/*"
        multiple
        style="display: none"
        (change)="onFileInput($event)"
      />
    </div>
  `,
  styles: [`
    .upload-container {
      padding: 20px;
    }

    .dropzone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 60px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      background-color: #f9f9f9;
    }

    .dropzone:hover {
      border-color: #4CAF50;
      background-color: #f0f0f0;
    }

    .dropzone.dragover {
      border-color: #4CAF50;
      background-color: #e8f5e9;
      transform: scale(1.02);
    }

    .dropzone-content {
      pointer-events: none;
    }

    .upload-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      color: #4CAF50;
    }

    h3 {
      margin: 0 0 10px;
      color: #333;
      font-size: 24px;
    }

    p {
      margin: 5px 0;
      color: #666;
    }

    .hint {
      font-size: 14px;
      color: #999;
      margin-top: 10px;
    }
  `]
})
export class UploadDropzoneComponent {
  @Output() filesSelected = new EventEmitter<File[]>();

  isDragOver = false;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(Array.from(files));
    }
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFiles(Array.from(input.files));
    }
  }

  private handleFiles(files: File[]): void {
    // Filter only image files
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      this.filesSelected.emit(imageFiles);
    } else {
      alert('Please select valid image files');
    }
  }
}
