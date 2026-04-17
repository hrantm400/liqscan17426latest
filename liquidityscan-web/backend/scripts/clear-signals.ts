
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Clearing all signals...');
    const { count } = await prisma.superEngulfingSignal.deleteMany({});
    console.log(`Deleted ${count} signals.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
