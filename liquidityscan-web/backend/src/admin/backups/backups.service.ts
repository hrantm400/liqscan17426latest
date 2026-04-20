import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export type BackupTier = 'daily' | 'weekly';

export interface BackupFileInfo {
  filename: string;
  tier: BackupTier;
  sizeBytes: number;
  mtime: string;
}

export interface BackupFreshness {
  latestMtime: string | null;
  ageHours: number | null;
  stale: boolean;
  dailyCount: number;
  weeklyCount: number;
}

// Staleness threshold: cron runs daily at 04:30 UTC, grace 60 min on
// healthchecks.io. 25h mirrors that grace and surfaces a missed run the
// next morning without tripping on a short cron/clock drift.
const STALE_THRESHOLD_HOURS = 25;
const DEFAULT_BACKUP_DIR = '/var/backups/liquidityscan';
const DUMP_SUFFIX = '.dump.gpg';

/**
 * Read-only metadata view over the on-disk backup directory. Mounted at
 * /api/admin/backups — see BackupsController.
 *
 * Service never invokes `pg_dump`, `pg_restore`, or writes to the backup
 * directory. Restore is runbook-only.
 */
@Injectable()
export class BackupsService {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
  }

  async listRecent(limit = 20): Promise<BackupFileInfo[]> {
    const [daily, weekly] = await Promise.all([
      this.collectTier('daily'),
      this.collectTier('weekly'),
    ]);
    const merged = [...daily, ...weekly].sort(
      (a, b) => Date.parse(b.mtime) - Date.parse(a.mtime),
    );
    return merged.slice(0, Math.max(0, limit));
  }

  async freshness(now: Date = new Date()): Promise<BackupFreshness> {
    const [daily, weekly] = await Promise.all([
      this.collectTier('daily'),
      this.collectTier('weekly'),
    ]);
    const merged = [...daily, ...weekly];
    if (merged.length === 0) {
      return {
        latestMtime: null,
        ageHours: null,
        stale: true,
        dailyCount: 0,
        weeklyCount: 0,
      };
    }
    const latestMs = Math.max(...merged.map((f) => Date.parse(f.mtime)));
    const ageHours = (now.getTime() - latestMs) / (1000 * 60 * 60);
    return {
      latestMtime: new Date(latestMs).toISOString(),
      ageHours: Number(ageHours.toFixed(2)),
      stale: ageHours > STALE_THRESHOLD_HOURS,
      dailyCount: daily.length,
      weeklyCount: weekly.length,
    };
  }

  private async collectTier(tier: BackupTier): Promise<BackupFileInfo[]> {
    const dir = path.join(this.baseDir, tier);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const infos = await Promise.all(
      entries
        .filter((name) => name.endsWith(DUMP_SUFFIX))
        .map(async (name): Promise<BackupFileInfo | null> => {
          try {
            const stat = await fs.stat(path.join(dir, name));
            return {
              filename: name,
              tier,
              sizeBytes: stat.size,
              mtime: stat.mtime.toISOString(),
            };
          } catch {
            return null;
          }
        }),
    );
    return infos.filter((v): v is BackupFileInfo => v !== null);
  }
}
