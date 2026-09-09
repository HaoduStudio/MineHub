# 部署与恢复

## 首次部署

根据下方配置说明配置 `.env` 环境变量：

| 变量                         | 配置                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `BETTER_AUTH_URL`            | 站点的完整 HTTPS 地址，不带末尾斜线                     |
| `BETTER_AUTH_SECRET`         | 32 字符的密钥                                           |
| `POSTGRES_PASSWORD`          | 数据库密码                                              |
| `REDIS_PASSWORD`             | Redis 密码                                              |
| `SMTP_HOST`、`SMTP_PORT`     | SMTP 服务器地址和端口                                   |
| `SMTP_SECURE`                | 465 隐式 TLS 通常为 `true`；STARTTLS 端口通常为 `false` |
| `SMTP_USER`、`SMTP_PASSWORD` | SMTP 服务账密                                           |
| `SMTP_FROM`                  | 发信地址                                                |

随后可 Clone 本仓库，本地构建并运行 Docker 镜像。

其中，管理员账户需要使用 `admin:create` 去创建，运行脚本成功后命令行将会显示临时密码。

```sh
docker compose build
docker compose up -d postgres redis
docker compose run --rm app npm run keys:init
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run admin:create -- admin@example.com Admin
docker compose up -d app
```

（如需）反向代理配置：

```nginx
client_max_body_size 12m;
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 升级

1. 暂停 Docker 容器。
2. 拉取最新 MineHub 代码，并构建 Docker 镜像。
3. 运行 `docker compose run --rm app npm run db:migrate`。
4. 启动 Docker 容器，并检查数据一致性。

## 备份

```sh
docker compose stop app
docker compose exec -T postgres pg_dump -U minehub -d minehub -Fc -f /tmp/minehub.dump
docker compose cp postgres:/tmp/minehub.dump ./backups/minehub.dump
docker compose run --rm --no-deps app tar -czf /app/data/assets-backup.tar.gz -C /app/data textures signing.pem
docker compose cp app:/app/data/assets-backup.tar.gz ./backups/assets-backup.tar.gz
docker compose start app
```

## 恢复

```sh
docker compose cp ./backups/minehub.dump postgres:/tmp/minehub.dump
docker compose exec -T postgres pg_restore -U minehub -d minehub --clean --if-exists --no-owner /tmp/minehub.dump
docker compose cp ./backups/assets-backup.tar.gz app:/app/data/assets-backup.tar.gz
docker compose run --rm --no-deps app tar -xzf /app/data/assets-backup.tar.gz -C /app/data
docker compose run --rm app npm run db:migrate
docker compose up -d app
```
