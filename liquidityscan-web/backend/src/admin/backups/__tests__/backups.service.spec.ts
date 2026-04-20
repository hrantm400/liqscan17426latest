import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BackupsService } from '../backups.service';

async function makeTempBackupDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lscan-backups-'));
  await fsp.mkdir(path.join(dir, 'daily'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'weekly'), { recursive: true });
  return dir;
}

async function touch(file: string, mtimeMs: number, sizeBytes = 20480) {
  await fsp.writeFile(file, Buffer.alloc(sizeBytes, 0x1f));
  const secs = mtimeMs / 1000;
  await fsp.utimes(file, secs, secs);
}

describe('BackupsService', () => {
  let tmp: string;
  let prevBackupDir: string | undefined;

  beforeEach(async () => {
    tmp = await makeTempBackupDir();
    prevBackupDir = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = tmp;
  });

  afterEach(async () => {
    if (prevBackupDir === undefined) {
      delete process.env.BACKUP_DIR;
    } else {
      process.env.BACKUP_DIR = prevBackupDir;
    }
    await fsp.rm(tmp, { recursive: true, force: true });
  });

  it('listRecent sorts by mtime desc, limits result, and tags tier correctly', async () => {
    const now = Date.now();
    // 6 daily + 2 weekly, mtimes staircase apart by 1h
    const schedule: Array<{ tier: 'daily' | 'weekly'; name: string; age: number }> = [
      { tier: 'daily', name: '2026-04-20.dump.gpg', age: 0 },
      { tier: 'daily', name: '2026-04-19.dump.gpg', age: 1 },
      { tier: 'daily', name: '2026-04-18.dump.gpg', age: 2 },
      { tier: 'weekly', name: '2026-04-13.dump.gpg', age: 3 },
      { tier: 'daily', name: '2026-04-17.dump.gpg', age: 4 },
      { tier: 'daily', name: '2026-04-16.dump.gpg', age: 5 },
      { tier: 'daily', name: '2026-04-15.dump.gpg', age: 6 },
      { tier: 'weekly', name: '2026-04-06.dump.gpg', age: 10 },
      // Non-dump file must be ignored
      { tier: 'daily', name: 'README.txt', age: 0 },
    ];
    for (const s of schedule) {
      const p = path.join(tmp, s.tier, s.name);
      await touch(p, now - s.age * 60 * 60 * 1000);
    }
    // Sanity: the stub README shouldn't crash readdir
    expect(fs.existsSync(path.join(tmp, 'daily', 'README.txt'))).toBe(true);

    const svc = new BackupsService();
    const result = await svc.listRecent(5);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.filename)).toEqual([
      '2026-04-20.dump.gpg',
      '2026-04-19.dump.gpg',
      '2026-04-18.dump.gpg',
      '2026-04-13.dump.gpg',
      '2026-04-17.dump.gpg',
    ]);
    expect(result[0].tier).toBe('daily');
    expect(result[3].tier).toBe('weekly');
    expect(result.every((r) => r.filename.endsWith('.dump.gpg'))).toBe(true);
    expect(result.every((r) => r.sizeBytes === 20480)).toBe(true);

    const all = await svc.listRecent(50);
    expect(all.map((r) => r.filename)).not.toContain('README.txt');
  });

  it('freshness reports stale when newest dump > 25h old, fresh otherwise', async () => {
    const now = new Date('2026-04-20T08:00:00.000Z');

    // Empty dirs → stale true, age null
    {
      const svc = new BackupsService();
      const h = await svc.freshness(now);
      expect(h).toEqual({
        latestMtime: null,
        ageHours: null,
        stale: true,
        dailyCount: 0,
        weeklyCount: 0,
      });
    }

    // Fresh (2h old) daily + older weekly
    await touch(path.join(tmp, 'daily', '2026-04-20.dump.gpg'), now.getTime() - 2 * 3600_000);
    await touch(path.join(tmp, 'weekly', '2026-04-13.dump.gpg'), now.getTime() - 7 * 24 * 3600_000);
    {
      const svc = new BackupsService();
      const h = await svc.freshness(now);
      expect(h.stale).toBe(false);
      expect(h.ageHours).toBeCloseTo(2, 2);
      expect(h.dailyCount).toBe(1);
      expect(h.weeklyCount).toBe(1);
      expect(h.latestMtime).toBe(new Date(now.getTime() - 2 * 3600_000).toISOString());
    }

    // Same set shifted so newest is 26h old → stale
    await touch(path.join(tmp, 'daily', '2026-04-20.dump.gpg'), now.getTime() - 26 * 3600_000);
    {
      const svc = new BackupsService();
      const h = await svc.freshness(now);
      expect(h.stale).toBe(true);
      expect(h.ageHours).toBeCloseTo(26, 2);
    }
  });
});
