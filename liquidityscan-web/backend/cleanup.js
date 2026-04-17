const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
    try {
        const deleted = await prisma.superEngulfingSignal.deleteMany({
            where: {
                strategyType: {
                    in: ['CISD', 'CISD_RETEST']
                }
            }
        });
        console.log(
            'Successfully deleted ' + deleted.count + ' old CISD signals (including legacy CISD_RETEST rows).',
        );
    } catch (e) {
        console.error('Error during cleanup:', e);
    } finally {
        await prisma.$disconnect();
    }
})();
