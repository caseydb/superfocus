import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testSyncUser() {
  console.log('🧪 Testing sync-user logic...');

  // Simulate data from Google auth
  const googleAuthData = {
    uid: 'google_oauth_uid_456',
    email: 'googleuser@gmail.com',
    name: 'John Doe',
    picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
  };

  try {
    console.log('📥 Input data:', googleAuthData);

    const { uid, email, name, picture } = googleAuthData;

    // This is exactly what sync-user does
    const user = await prisma.user.upsert({
      where: { auth_id: uid },
      update: {
        last_active: new Date(),
      },
      create: {
        auth_id: uid,
        email: email || "",
        first_name: name?.split(" ")[0] || "",
        last_name: name?.split(" ").slice(1).join(" ") || "",
        profile_image: picture || "",
        last_active: new Date(),
      },
    });

    console.log('✅ User synced successfully:', user);

    // Test with empty name
    const emptyNameData = {
      uid: 'google_oauth_uid_789',
      email: 'noname@gmail.com',
      name: undefined,
      picture: undefined
    };

    console.log('\n📥 Testing with empty name:', emptyNameData);

    const user2 = await prisma.user.upsert({
      where: { auth_id: emptyNameData.uid },
      update: {
        last_active: new Date(),
      },
      create: {
        auth_id: emptyNameData.uid,
        email: emptyNameData.email || "",
        first_name: emptyNameData.name?.split(" ")[0] || "",
        last_name: emptyNameData.name?.split(" ").slice(1).join(" ") || "",
        profile_image: emptyNameData.picture || "",
        last_active: new Date(),
      },
    });

    console.log('✅ User with empty fields synced:', user2);

    // List all users
    const allUsers = await prisma.user.findMany();
    console.log('\n📋 All users in database:');
    allUsers.forEach(u => {
      console.log(`- ${u.email} (${u.first_name} ${u.last_name})`);
    });

  } catch (error) {
    console.error('❌ Error in test:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testSyncUser();