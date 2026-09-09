# MineHub

面向自部署 Minecraft Java 服务器社区的统一服务门户，包含账户认证、角色、衣柜、公开皮肤库和管理面板等诸多功能。

## 开发

```powershell
Copy-Item .env.example .env
vp install
```

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
docker compose -f compose.dev.yml up -d
vp run db:generate
vp run db:migrate
vp run admin:create -- admin@example.com Admin
vp run dev
```
