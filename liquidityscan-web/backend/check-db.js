const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const all = await prisma.superEngulfingSignal.findMany({
        take: 10,
        orderBy: { detectedAt: 'desc' }
    });
    console.log("Latest 10 signals:", all.map(s => ({ id: s.id, status: s.status, outcome: s.outcome })));

    const counts = await prisma.superEngulfingSignal.groupBy({
        by: ['status'],
        _count: {
            status: true
        }
    });
    console.log("Status counts:", counts);
}
check().finally(() => prisma.$disconnect());
