ALTER TABLE "SiteSettings"
ADD COLUMN "authCaptionMode" TEXT NOT NULL DEFAULT 'site',
ADD COLUMN "authCaptionText" TEXT NOT NULL DEFAULT '',
ADD COLUMN "authHitokotoUrl" TEXT NOT NULL DEFAULT 'https://v1.hitokoto.cn/';
