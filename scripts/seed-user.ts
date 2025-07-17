import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding user table with test data...');

  try {
    // Create a test user
    const testUser = await prisma.user.create({
      data: {
        auth_id: 'test_firebase_uid_123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        profile_image: 'https://example.com/avatar.jpg',
        last_active: new Date(),
      },
    });

    console.log('✅ Created test user:', testUser);

    // Try to upsert the same user (like sync-user does)
    const upsertedUser = await prisma.user.upsert({
      where: { auth_id: 'test_firebase_uid_123' },
      update: {
        last_active: new Date(),
      },
      create: {
        auth_id: 'test_firebase_uid_123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User Updated',
        profile_image: 'https://example.com/avatar.jpg',
        last_active: new Date(),
      },
    });

    console.log('✅ Upserted user:', upsertedUser);

    // List all users
    const allUsers = await prisma.user.findMany();
    console.log('📋 All users in database:', allUsers);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });