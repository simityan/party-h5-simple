import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AppError } from './utils/helpers';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// IP提取中间件 — 从请求中获取客户端真实IP
// 支持反向代理场景（X-Forwarded-For / X-Real-IP）
app.use((req, _res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    req.clientIp = forwarded.split(',')[0].trim();
  } else if (req.headers['x-real-ip']) {
    req.clientIp = req.headers['x-real-ip'] as string;
  } else {
    req.clientIp = req.ip || req.socket.remoteAddress || 'unknown';
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
