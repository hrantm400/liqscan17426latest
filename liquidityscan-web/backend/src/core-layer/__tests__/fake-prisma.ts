/**
 * Minimal in-memory Prisma stand-in for Core-Layer service tests.
 *
 * Implements ONLY the subset of the client surface that the three services
 * actually touch: coreLayerSignal, coreLayerHistoryEntry, superEngulfingSignal.
 * Supports findFirst / findMany / findUnique / create / update / groupBy /
 * count plus a very thin `$transaction` shim that inlines the callback (good
 * enough — Core-Layer writes are per-chain atomic and we do not actually
 * model rollback here).
 *
 * Using a hand-rolled fake instead of `jest.mock('@prisma/client')` keeps
 * assertion surfaces thin — tests read and write through the same objects the
 * services do. If a service call tries to use an un-implemented method, the
 * test fails with a clear "foo.bar is not a function", which is better than a
 * silent noop.
 */

type Row = Record<string, any>;

class Table<T extends Row> {
    rows: T[] = [];
    constructor(private readonly name: string) {}

    private matchesWhere(row: T, where: any): boolean {
        if (!where) return true;
        for (const [key, expected] of Object.entries(where)) {
            if (expected === undefined) continue;
            if (
                expected &&
                typeof expected === 'object' &&
                !Array.isArray(expected) &&
                !(expected instanceof Date)
            ) {
                const exp = expected as Record<string, any>;
                const val = (row as any)[key];
                // Comparison operators — just enough to support the
                // tier-aware depth filter (`{ lte: SCOUT_MAX_DEPTH }`)
                // plus common extensions for future tests.
                if ('in' in exp) {
                    if (!exp.in.includes(val)) return false;
                    continue;
                }
                if ('lte' in exp && !(val <= exp.lte)) return false;
                if ('lt' in exp && !(val < exp.lt)) return false;
                if ('gte' in exp && !(val >= exp.gte)) return false;
                if ('gt' in exp && !(val > exp.gt)) return false;
                if ('not' in exp && val === exp.not) return false;
                continue;
            }
            if ((row as any)[key] !== expected) return false;
        }
        return true;
    }

    async findFirst({ where }: { where: any }): Promise<T | null> {
        return this.rows.find((r) => this.matchesWhere(r, where)) ?? null;
    }

    async findUnique({ where, include }: { where: any; include?: any }): Promise<T | null> {
        const row = this.rows.find((r) => (r as any).id === where.id) ?? null;
        if (row && include) return this.applyInclude(row, include) as T;
        return row;
    }

    async findMany({
        where,
        orderBy,
        take,
        cursor,
        skip,
        include,
        select,
    }: {
        where?: any;
        orderBy?: any;
        take?: number;
        cursor?: { id: string };
        skip?: number;
        include?: any;
        select?: any;
    } = {}): Promise<T[]> {
        let list = this.rows.filter((r) => this.matchesWhere(r, where));
        if (orderBy) {
            const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
            list = [...list].sort((a, b) => {
                for (const rule of rules) {
                    const [field, dir] = Object.entries(rule)[0] as [string, 'asc' | 'desc'];
                    const av = (a as any)[field];
                    const bv = (b as any)[field];
                    const avN = av instanceof Date ? av.getTime() : av;
                    const bvN = bv instanceof Date ? bv.getTime() : bv;
                    if (avN < bvN) return dir === 'asc' ? -1 : 1;
                    if (avN > bvN) return dir === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        if (cursor) {
            const idx = list.findIndex((r) => (r as any).id === cursor.id);
            if (idx >= 0) list = list.slice(idx + (skip ?? 0));
        }
        if (typeof take === 'number') list = list.slice(0, take);
        if (include) list = list.map((r) => this.applyInclude(r, include)) as T[];
        if (select) list = list.map((r) => this.applySelect(r, select)) as T[];
        return list;
    }

    async count({ where }: { where?: any } = {}): Promise<number> {
        return this.rows.filter((r) => this.matchesWhere(r, where)).length;
    }

    async groupBy({
        by,
        where,
    }: {
        by: string[];
        where?: any;
        _count?: any;
    }): Promise<Array<any>> {
        const list = this.rows.filter((r) => this.matchesWhere(r, where));
        const buckets = new Map<string, { keys: Row; _count: number }>();
        for (const row of list) {
            const keys: Row = {};
            for (const k of by) keys[k] = (row as any)[k];
            const keyStr = by.map((k) => String(keys[k])).join('|');
            const existing = buckets.get(keyStr);
            if (existing) existing._count++;
            else buckets.set(keyStr, { keys, _count: 1 });
        }
        return Array.from(buckets.values()).map((b) => ({ ...b.keys, _count: b._count }));
    }

    async create({ data }: { data: Partial<T> }): Promise<T> {
        const id = (data as any).id ?? `gen-${this.name}-${this.rows.length + 1}`;
        const now = new Date();
        const row = { id, createdAt: now, updatedAt: now, ...data } as unknown as T;
        this.rows.push(row);
        return row;
    }

    async update({ where, data }: { where: { id: string }; data: Partial<T> }): Promise<T> {
        const idx = this.rows.findIndex((r) => (r as any).id === where.id);
        if (idx < 0) throw new Error(`${this.name}: no row with id=${where.id}`);
        this.rows[idx] = { ...this.rows[idx], ...data, updatedAt: new Date() } as unknown as T;
        return this.rows[idx];
    }

    private applyInclude(row: T, include: any): T {
        const out: any = { ...row };
        if (include.history && this.name === 'coreLayerSignal') {
            const entries: Row[] = (FakePrismaService.singleton?.coreLayerHistoryEntry.rows ?? []).filter(
                (e) => e.signalId === (row as any).id,
            );
            let sorted = [...entries];
            if (include.history.orderBy) {
                const [field, dir] = Object.entries(include.history.orderBy)[0] as [
                    string,
                    'asc' | 'desc',
                ];
                sorted.sort((a, b) => {
                    const av = a[field] instanceof Date ? a[field].getTime() : a[field];
                    const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
                    if (av < bv) return dir === 'asc' ? -1 : 1;
                    if (av > bv) return dir === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            if (typeof include.history.take === 'number') sorted = sorted.slice(0, include.history.take);
            out.history = sorted;
        }
        return out as T;
    }

    private applySelect(row: T, select: any): T {
        const out: any = {};
        for (const [k, v] of Object.entries(select)) if (v) out[k] = (row as any)[k];
        return out as T;
    }
}

export class FakePrismaService {
    static singleton: FakePrismaService | null = null;

    coreLayerSignal = new Table<any>('coreLayerSignal');
    coreLayerHistoryEntry = new Table<any>('coreLayerHistoryEntry');
    superEngulfingSignal = new Table<any>('superEngulfingSignal');

    constructor() {
        FakePrismaService.singleton = this;
    }

    async $transaction<T>(fn: (tx: FakePrismaService) => Promise<T>): Promise<T> {
        return fn(this);
    }
}
