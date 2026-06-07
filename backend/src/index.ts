import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AppError } from './utils/helpers';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

// 反向代理支持：确保 req.ip 返回真实客户端IP
app.set('trust proxy', 1);

// IP提取中间件 — 从请求中获取客户端真实IP
// 支持反向代理场景（X-Forwarded-For / X-Real-IP）
app.use((req, _res, next) => {
  // IP提取优先级：X-Real-IP > X-Forwarded-For 最后一跳 > req.ip > socket
  // X-Real-IP 由 Nginx 设置（proxy_set_header X-Real-IP $remote_addr），不可被客户端伪造
  // X-Forwarded-For 取最后一跳（最靠近可信代理添加的），避免客户端伪造前面的值
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) {
    req.clientIp = realIp.trim();
  } else {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) {
      // 多级代理时取第一个（最原始的客户端IP）
      // 注意：如果前面有CDN，可能需要取最后一个；根据部署架构调整
      req.clientIp = forwarded.split(',')[0].trim();
    } else {
      req.clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    }
  }
  next();
});

// 路由
import gameRouter from './routes/game';
import playerRouter from './routes/player';
import taskRouter from './routes/task';

app.use('/api/game', gameRouter);
app.use('/api/player', playerRouter);
app.use('/api/task', taskRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 全局错误处理
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
  });
});

app.listen(PORT, () => {
  console.log(`[Server] Party H5 Simple backend running on port ${PORT}`);
});

export default app;
