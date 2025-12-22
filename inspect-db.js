
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        // List tables
        const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
        console.log('Tables in database:');
        for (const t of tables) {
            if (t.name === '_prisma_migrations' || t.name === 'sqlite_sequence') continue;
            console.log(`- ${t.name}`);
            // Count rows for each table
            try {
                const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${t.name}"`);
                // SQLite returns count as BigInt usually or number in some drivers, handle it
                const num = count[0].count.toString();
                console.log(`  Count: ${num}`);
            } catch (e) {
                console.log(`  Could not count rows for ${t.name}: ${e.message}`);
            }
        }

        // specific check for duplicate AllowedUser
        const allowedUsers = await prisma.allowedUser.findMany();
        console.log(`\nAllowedUsers found via Prisma: ${allowedUsers.length}`);

        // Check for duplicates in AllowedUser email
        const emailCounts = {};
        for (const u of allowedUsers) {
            emailCounts[u.email] = (emailCounts[u.email] || 0) + 1;
        }
        const duplicateEmails = Object.entries(emailCounts).filter(([_, count]) => count > 1);

        if (duplicateEmails.length > 0) {
            console.log('\nDuplicate Emails in AllowedUser:');
            duplicateEmails.forEach(([email, count]) => console.log(`  ${email}: ${count}`));
        } else {
            console.log('\nNo duplicate emails in AllowedUser.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
