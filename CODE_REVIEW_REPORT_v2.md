# 害你在心口难开·简化版 — 代码全面审查报告

> 审查时间：2026-06-07  
> 审查范围：party-h5-simple 全部源码（后端 8 文件 + 前端 8 文件）  
> 基于：commit 2622c42

---

## 一、原版5个遗留UI问题复核

| # | 问题 | 状态 | 说明 |
|---|------|------|------|
| 1 | 三卡并列布局 | ✅ 已修复 | `flex gap-3 justify-center` + `flex-1 min-w-0 max-w-[120px]`，三卡横排正常 |
| 2 | 后2名警告UI | ✅ 已修复 | `player.isBottom2` 时显示红色警告条 `⚠️ 你当前处于后2名，加油！` |
| 3 | 卡牌翻转展示惩罚 | ✅ 已修复 | `perspective: 1000px` + `rotateY(180deg)` + `backface-visibility: hidden`，CHALLENGED/CANCELED 状态卡翻转展示惩罚 |
| 4 | MEDIUM难度颜色不一致 | ❌ 未修复 | emoji🟡 但 `color: 'text-green-500'`，`rarityBg: 'bg-green-50'`，`rarityBorder: 'border-green-400'` 均应为 yellow 系列 |
| 5 | OpenID mock 值 | ❌ 更严重了 | CreatePage.tsx 仍传 `openId` 参数，但 `api/game.ts joinGame` 签名已改为 `{ gameCode, nickname }`，**将导致 TypeScript 编译失败** |

---

## 二、严重问题（SEVERE）— 必须修复

### 🔴 S1. CreatePage.tsx 传了不存在的 `openId` 参数 — 构建必挂

**文件**：`frontend/src/pages/CreatePage.tsx` 第 50-53 行

```tsx
const openId = `mock_${Date.now()}`;
const result = await joinGame({
  gameCode: game.code,
  openId,       // ← 不存在于新签名中
  nickname: nickname.trim(),
});
```

**原因**：`api/game.ts` 的 `joinGame` 签名已简化为 `{ gameCode: string; nickname: string }`，没有 `openId` 字段。TypeScript 严格模式下会报 `Object literal may only specify known properties` 错误，前端无法编译。

**修复**：
```tsx
const result = await joinGame({
  gameCode: game.code,
  nickname: nickname.trim(),
});
```

---

### 🔴 S2. `refreshAllTasks` 未更新 `totalTasksDrawn` — 手气维度计算错误

**文件**：`backend/src/services/taskService.ts` 第 970-978 行

```ts
if (extremeCount > 0) {
  await tx.player.update({
    where: { id: playerId },
    data: { extremeTasksDrawn: { increment: extremeCount } },
  });
}
```

刷新后只更新了 `extremeTasksDrawn`，**没有更新 `totalTasksDrawn`**。

而初始发牌时（`drawTasksForPlayer` 第 295 行）是正确设置的：
```ts
totalTasksDrawn: tasksDrawn, // 事务内 count 当前玩家所有任务
```

**影响**：
- 结算页"手气"维度计算：`extremeTasksDrawn / totalTasksDrawn`
- 如果玩家刷新后抽到极端任务，`extremeTasksDrawn` 增加但 `totalTasksDrawn` 不变
- 极端情况：刷新后 totalTasksDrawn=3，extremeTasksDrawn 可能为 2+，手气值异常偏高

**修复**：在 `refreshAllTasks` 事务末尾补充更新：
```ts
// 更新玩家统计（包括 totalTasksDrawn）
const currentTotalTasks = await tx.playerTask.count({
  where: { playerId, gameId: player.gameId },
});
await tx.player.update({
  where: { id: playerId },
  data: {
    extremeTasksDrawn: { increment: extremeCount },
    totalTasksDrawn: currentTotalTasks,
  },
});
```

---

### 🔴 S3. Express 未设置 `trust proxy` — 反向代理后 `req.ip` 回退失效

**文件**：`backend/src/index.ts`

当前 IP 提取中间件：
```ts
const forwarded = req.headers['x-forwarded-for'];
if (typeof forwarded === 'string') {
  req.clientIp = forwarded.split(',')[0].trim();
} else if (req.headers['x-real-ip']) {
  req.clientIp = req.headers['x-real-ip'] as string;
} else {
  req.clientIp = req.ip || req.socket.remoteAddress || 'unknown';
}
```

前两级（X-Forwarded-For / X-Real-IP）没问题，但 **`req.ip` 需要 `trust proxy` 才能在反向代理后返回真实 IP**，否则返回的是代理服务器 IP。

**修复**：在中间件前添加：
```ts
app.set('trust proxy', 1);
```

---

## 三、中等问题（MEDIUM）— 建议修复

### 🟡 M1. MEDIUM 难度颜色仍然不一致

**文件**：`frontend/src/pages/GamePage.tsx` 第 34-42 行

```ts
MEDIUM: {
  emoji: '🟡',                    // 黄色 emoji
  color: 'text-green-500',        // ← 绿色！应为 text-yellow-500
  points: '+2',
  rarityBg: 'bg-green-50',        // ← 绿色！应为 bg-yellow-50
  rarityBorder: 'border-green-400', // ← 绿色！应为 border-yellow-400
  rarityLabel: '中等',
  glowShadow: 'shadow-sm',
},
```

EASY 用 green、MEDIUM 也用 green，视觉上无法区分。应统一为 yellow 系列。

---

### 🟡 M2. CORS 允许所有来源 — 生产环境风险

**文件**：`backend/src/index.ts` 第 9 行

```ts
app.use(cors());
```

无任何限制，任何域名的网页都可以调用 API。

**建议**：
```ts
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
```

---

### 🟡 M3. X-Forwarded-For 头可被客户端伪造

**文件**：`backend/src/index.ts` 第 13-17 行

```ts
const forwarded = req.headers['x-forwarded-for'];
if (typeof forwarded === 'string') {
  req.clientIp = forwarded.split(',')[0].trim();  // ← 直接信任第一个值
}
```

恶意客户端可以设置 `X-Forwarded-For` 头来伪造 IP，可能绕过 IP 唯一约束重复加入游戏。

**建议**：
- Nginx 配置中用 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` 覆盖客户端值
- 后端改为取 **最后一个由可信代理添加的 IP**，或仅信任 `X-Real-IP`（由 Nginx 设置）

---

### 🟡 M4. `confirmDeclare` 未检查游戏状态

**文件**：`backend/src/services/taskService.ts` 第 416 行起

`declareComplete` 和 `challenge` 都校验了 `game.status === 'PLAYING'`，但 `confirmDeclare` **没有校验游戏状态**。

虽然 `endGame` 会将 PENDING 声明标记为 DENIED，但存在竞态窗口：游戏正在结算时目标方仍可确认声明。

**建议**：在 `confirmDeclare` 开头加入游戏状态校验。

---

### 🟡 M5. 缺少 API 速率限制

所有接口均无速率限制。3 秒轮询 + 无限创建游戏 + 无限发起质疑 = 潜在 DoS 风险。

**建议**：至少对以下接口加限流：
- `POST /api/game` — 每IP每分钟5次
- `POST /api/player/:id/challenge` — 每玩家每分钟10次
- `GET /api/player/:id/poll` — 保持3秒间隔即可

---

## 四、轻微问题（MINOR）— 可选修复

### ⚪ m1. 匿名爆料查询无数量限制

**文件**：`backend/src/services/taskService.ts` `getTips` 函数

```ts
const tips = await prisma.anonymousTip.findMany({
  where: { gameId, isActive: true },
  orderBy: { createdAt: 'desc' },
  // 无 take 限制
});
```

游戏后期可能积累大量爆料，建议加 `take: 20`。

---

### ⚪ m2. 缺少昵称输入校验

`nickname` 无长度/格式后端校验（前端限制 10 字符），恶意用户可绕过前端传超长昵称或特殊字符。

**建议**：后端 `joinGame` 中加入：
```ts
if (!data.nickname || data.nickname.trim().length > 10) {
  throw new AppError(400, '昵称长度需在1-10个字符之间');
}
```

---

### ⚪ m3. `generateGameCode` 无重试上限

**文件**：`backend/src/utils/helpers.ts`

```ts
while (exists) {
  // 生成6位码 → 查重 → 重复则重来
}
```

理论上可能无限循环。虽然6位码空间够大（约20亿），但防御性编程应加上重试上限。

---

### ⚪ m4. 前端轮询无退避机制

网络错误时仍保持3秒间隔轮询，无指数退避。网络恢复后可能造成突发请求。

---

### ⚪ m5. 缺少部署配置

无 Dockerfile、docker-compose.yml 或部署文档。生产环境需额外配置 Nginx + PM2。

---

## 五、原版逻辑保留正确性确认

以下核心逻辑已确认与原版一致，无简化导致的遗漏：

| 模块 | 状态 | 说明 |
|------|------|------|
| 声明完成 → 目标确认/否认 | ✅ | 含否认触发质疑、双方+1刷新、全任务resolve+3刷新 |
| 质疑自动匹配 | ✅ | Levenshtein 相似度 ≥75% 命中、短文本特殊处理 |
| 批量刷新 | ✅ | 原子扣减 + 共享卡池 + V2目标分配 |
| 结算六维度 | ✅ | 狼性/鹰眼/戏骨/磁场/铁皮/手气 |
| 勋章系统 | ✅ | 6枚勋章逻辑完整 |
| 全员投票结束 | ✅ | 含PENDING声明自动DENIED、匿名爆料失效 |
| 后2名状态更新 | ✅ | 事务内原子更新 |
| 并发安全 | ✅ | P2002处理、条件更新防超扣、事务内二次校验 |

---

## 六、修复优先级总结

| 优先级 | 问题 | 影响 |
|--------|------|------|
| **P0 立即** | S1. CreatePage openId 参数 | 前端无法编译 |
| **P0 立即** | M1. MEDIUM 颜色不一致 | 视觉Bug |
| **P1 上线前** | S2. totalTasksDrawn 未更新 | 手气维度计算错误 |
| **P1 上线前** | S3. trust proxy 未设置 | 反向代理后IP识别失败 |
| **P1 上线前** | M3. X-Forwarded-For 伪造 | IP唯一约束可绕过 |
| **P2 建议** | M2. CORS 限制 | 安全加固 |
| **P2 建议** | M4. confirmDeclare 状态校验 | 竞态边界 |
| **P2 建议** | M5. 速率限制 | 抗滥用 |
| **P3 可选** | m1-m5 | 防御性增强 |
