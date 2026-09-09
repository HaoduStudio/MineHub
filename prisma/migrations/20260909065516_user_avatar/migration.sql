-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarHash" TEXT,
ADD COLUMN     "avatarKind" TEXT,
ADD COLUMN     "avatarTextureId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarTextureId_fkey" FOREIGN KEY ("avatarTextureId") REFERENCES "Texture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
