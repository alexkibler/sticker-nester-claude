import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface HealthResponse {
  status: string;
  message: string;
  version: {
    branch: string;
    commit: string;
    buildTime: string;
    nodeEnv: string;
  };
}

/**
 * Version Badge Component
 *
 * Displays git branch name and version info in the corner of the screen.
 * Useful for identifying which version is running during development/staging.
 */
@Component({
  selector: 'app-version-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="version-badge" *ngIf="version" [class.production]="isProduction">
      <div class="badge-content" [class.expanded]="expanded" (click)="toggleExpand()">
        <div class="branch-name">
          {{ version.branch }}
        </div>
        <div class="version-details" *ngIf="expanded">
          <div class="detail-row">
            <span class="label">Commit:</span>
            <span class="value">{{ shortCommit }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Build:</span>
            <span class="value">{{ version.buildTime }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Env:</span>
            <span class="value">{{ version.nodeEnv }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .version-badge {
      position: fixed;
      bottom: 10px;
      right: 10px;
      z-index: 9999;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 12px;
    }

    .badge-content {
      background: rgba(0, 123, 255, 0.9);
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: all 0.3s ease;
      max-width: 250px;
    }

    .badge-content:hover {
      background: rgba(0, 123, 255, 1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .badge-content.expanded {
      padding: 10px 14px;
    }

    .version-badge.production .badge-content {
      background: rgba(40, 167, 69, 0.9);
    }

    .version-badge.production .badge-content:hover {
      background: rgba(40, 167, 69, 1);
    }

    .branch-name {
      font-weight: bold;
      margin-bottom: 0;
    }

    .badge-content.expanded .branch-name {
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    }

    .version-details {
      margin-top: 8px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      font-size: 11px;
    }

    .detail-row .label {
      opacity: 0.8;
      margin-right: 8px;
    }

    .detail-row .value {
      font-weight: 600;
      text-align: right;
    }

    /* Hide in production unless expanded */
    .version-badge.production:not(:hover) .badge-content:not(.expanded) {
      opacity: 0.3;
    }
  `]
})
export class VersionBadgeComponent implements OnInit {
  version: HealthResponse['version'] | null = null;
  expanded = false;
  isProduction = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchVersionInfo();
  }

  get shortCommit(): string {
    return this.version?.commit?.substring(0, 7) || 'unknown';
  }

  fetchVersionInfo(): void {
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (response) => {
        this.version = response.version;
        this.isProduction = response.version.nodeEnv === 'production';
      },
      error: (err) => {
        console.warn('Failed to fetch version info:', err);
        // Set fallback version
        this.version = {
          branch: 'local-dev',
          commit: 'unknown',
          buildTime: new Date().toISOString(),
          nodeEnv: 'development'
        };
      }
    });
  }

  toggleExpand(): void {
    this.expanded = !this.expanded;
  }
}
