# 害你在心口难开·动作版 — 简化版

> 聚会H5游戏 | 无登录无鉴权 | IP绑定用户

## 与原版区别

| 项目 | 原版 (party-h5-game) | 简化版 (party-h5-simple) |
|------|---------------------|------------------------|
| 用户身份 | 微信 OpenID | 客户端 IP 自动绑定 |
| 登录鉴权 | 需要 | 不需要 |
| 加入流程 | 微信授权 → 获取OpenID → 输入昵称 | 直接输入昵称 → IP自动绑定 |
| 部署要求 | 需要微信公众号 | 普通Web服务器即可 |

## 技术栈

- **后端**: Express 5 + Prisma + PostgreSQL
- **前端**: React 19 + Vite + Tailwind CSS + Antd Mobile
- **用户识别**: 客户端 IP（支持反向代理 X-Forwarded-For / X-Real-IP）

## IP绑定逻辑

1. 请求进入后端时，中间件自动提取客户端IP
2. 优先级：`X-Forwarded-For` → `X-Real-IP` → `req.ip` → `socket.remoteAddress`
3. 同一IP在同一游戏中只能绑定一个玩家
4. 加入游戏API只需传 `gameCode` + `nickname`，IP由后端自动提取

### 注意事项

- 同一WiFi下多台设备共享公网IP，需确保反向代理正确传递客户端IP
- 推荐使用 Nginx 配置 `proxy_set_header X-Real-IP $remote_addr;`
- 本地开发时所有请求IP相同（127.0.0.1），仅用于测试

## 快速开始

```bash
# 后端
cd backend
npm install
cp .env.example .env  # 编辑 DATABASE_URL
npx prisma db push
npx prisma generate
npm run db:seed
npm run dev

# 前端
cd frontend
npm install
npm run dev
```

## 游戏规则

详见 `docs/害你在心口难开_完整规则v2.md`

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/game | 创建游戏 |
| GET | /api/game/:id | 获取游戏信息 |
| POST | /api/game/:id/start | 开始游戏 |
| POST | /api/game/:id/end | 投票结束游戏 |
| GET | /api/game/:id/settlement | 获取结算数据 |
| POST | /api/player/join | 加入游戏（IP自动绑定） |
| GET | /api/player/:id/poll | 合并轮询 |
| POST | /api/player/:id/declare-complete | 声明完成 |
| POST | /api/player/:id/challenge | 发起质疑 |
| POST | /api/player/:id/confirm-declare | 确认/否认声明 |
| POST | /api/player/:id/refresh | 批量刷新手牌 |
