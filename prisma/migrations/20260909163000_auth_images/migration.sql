-- AlterTable
ALTER TABLE "SiteSettings"
ADD COLUMN     "authImageLight" TEXT NOT NULL DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Minecraft_-_Taiga.jpg',
ADD COLUMN     "authImageDark" TEXT NOT NULL DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Screenshot_from_the_Minecraft_Nether.png',
ADD COLUMN     "authImageCacheMinutes" INTEGER NOT NULL DEFAULT 60;
