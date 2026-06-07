import { Router, type Request, type Response } from 'express';
import * as gameService from '../services/gameService';
import * as playerService from '../services/playerService';
import * as taskService from '../services/taskService';
import { AppError } from '../utils/helpers';

const router = Router();

// POST /api/player/join — 玩家加入游戏（IP自动绑定）
router.post('/join', async (req: Request, res: Response) => {
  const { gameCode, nickname } = req.body;
  const clientIp = req.clientIp || 'unknown';
  if (!gameCode || !nickname) {
    throw new AppError(400, '缺少必要参数: gameCode, nickname');
  }
  // 不需要传 openId，IP 由中间件自动提取
  const result = await gameService.joinGame({ gameCode, clientIp, nickname });
  res.json(result);
});

// GET /api/player/:id/status — 获取玩家状态
router.get('/:id/status', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await playerService.getPlayerStatus(id);
  res.json(result);
});

// GET /api/player/:id/poll — V2 合并轮询
router.get('/:id/poll', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await playerService.pollGameData(id);
  res.json(result);
});

// GET /api/player/:id/messages — 轮询获取待处理消息
router.get('/:id/messages', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await playerService.getPendingMessages(id);
  res.json(result);
});

// POST /api/player/:id/declare-complete — 声明完成
router.post('/:id/declare-complete', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { taskId } = req.body;
  if (!taskId) {
    throw new AppError(400, '缺少必要参数: taskId');
  }
  const result = await taskService.declareComplete(id, { taskId });
  res.json(result);
});

// POST /api/player/:id/challenge — 发起质疑
router.post('/:id/challenge', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { challengedId, guessContent } = req.body;
  if (!challengedId || !guessContent) {
    throw new AppError(400, '缺少必要参数: challengedId, guessContent');
  }
  const result = await taskService.challenge(id, { challengedId, guessContent });
  res.json(result);
});

// POST /api/player/:id/confirm-declare — 确认/否认声明完成
router.post('/:id/confirm-declare', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { declareId, confirmed } = req.body;
  if (!declareId || typeof confirmed !== 'boolean') {
    throw new AppError(400, '缺少必要参数: declareId, confirmed');
  }
  const result = await taskService.confirmDeclare(id, { declareId, confirmed });
  res.json(result);
});

// POST /api/player/:id/refresh — V2 批量刷新手牌
router.post('/:id/refresh', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await taskService.refreshAllTasks(id);
  res.json(result);
});

export default router;
