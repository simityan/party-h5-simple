import prisma from '../utils/prisma';
import { generateGameCode, formatGameInfo, formatPlayerInfo, updateBottom2Status, AppError } from '../utils/helpers';
import { drawTasksForPlayer } from './taskService';
import { PrismaClientKnownRequestError } from '../generated/prisma/internal/prismaNamespace';

// ============================================
// 创建游戏
// ============================================
export async function createGame(data: {
  playerCount: number;
  startTime?: string;
  endTime: string;
  teamRewards?: string[];
  teamPunishments?: string[];
}) {
  if (data.playerCount < 4 || data.playerCount > 8) {
    throw new AppError(400, '参与人数需在4-8人之间');
  }

  const code = await generateGameCode();

  const game = await prisma.game.create({
    data: {
      code,
      playerCount: data.playerCount,
      startTime: data.startTime ? new Date(data.startTime) : null,
      endTime: new Date(data.endTime),
      teamRewards: data.teamRewards || [],
      teamPunishments: data.teamPunishments || [],
    },
    include: { players: true },
  });

  return formatGameInfo(game);
}

// ============================================
// 获取游戏信息
// ============================================
export async function getGame(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { players: true },
  });

  if (!game) throw new AppError(404, '游戏不存在');

  return formatGameInfo(game);
}

// ============================================
// 开始游戏
// ============================================
export async function startGame(gameId: string) {
  const game = await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });

    if (!game) throw new AppError(404, '游戏不存在');
    if (game.status !== 'WAITING') throw new AppError(400, '当前游戏状态不允许开始');
    if (game.players.length < 4) throw new AppError(400, '至少需要4名玩家才能开始');

    const updated = await tx.game.update({
      where: { id: gameId },
      data: {
        status: 'PLAYING',
        startedAt: new Date(),
      },
      include: { players: true },
    });

    await tx.player.updateMany({
      where: { gameId },
      data: { refreshChances: 3 },
    });

    return updated;
  });

  for (const player of game.players) {
    await drawTasksForPlayer(player.id, game.id, game.players);
  }

  await updateBottom2Status(game.id);

  return formatGameInfo(game);
}

// ============================================
// 结束游戏（全员点击结束）
// ============================================
export async function endGame(gameId: string, playerId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });
  if (!game) throw new AppError(404, '游戏不存在');
  if (game.status !== 'PLAYING') throw new AppError(400, '当前游戏不在进行中');

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || player.gameId !== gameId) throw new AppError(403, '你不是该游戏的玩家');
  if (player.votedEnd) throw new AppError(400, '你已经投过票了');

  const result = await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: playerId },
      data: { votedEnd: true },
    });

    const players = await tx.player.findMany({
      where: { gameId },
      select: { id: true, votedEnd: true },
    });

    const votedCount = players.filter((p) => p.votedEnd).length;
    const totalPlayers = players.length;

    let allVoted = false;

    if (votedCount === totalPlayers) {
      const currentGame = await tx.game.findUnique({
        where: { id: gameId },
        select: { status: true },
      });
      if (currentGame?.status === 'PLAYING') {
        await tx.game.update({
          where: { id: gameId },
          data: {
            status: 'ENDED',
            endedAt: new Date(),
          },
        });

        await tx.playerTask.updateMany({
          where: { gameId, status: 'ACTIVE' },
          data: { status: 'CANCELED', removedAt: new Date() },
        });

        const pendingDeclares = await tx.declareComplete.findMany({
          where: { gameId, status: 'PENDING' },
        });
        if (pendingDeclares.length > 0) {
          await tx.declareComplete.updateMany({
            where: { gameId, status: 'PENDING' },
            data: { status: 'DENIED', confirmedAt: new Date() },
          });
          await tx.pendingMessage.updateMany({
            where: {
              gameId,
              type: 'DECLARE_COMPLETE',
              relatedId: { in: pendingDeclares.map((d) => d.id) },
              isHandled: false,
            },
            data: { isHandled: true, handledAt: new Date() },
          });
        }

        await tx.anonymousTip.updateMany({
          where: { gameId, isActive: true },
          data: { isActive: false },
        });

        allVoted = true;
      }
    }

    return { allVoted, votedCount, totalPlayers };
  });

  return result;
}

// ============================================
// 加入游戏（IP绑定用户）
// ============================================
export async function joinGame(data: {
  gameCode: string;
  clientIp: string;
  nickname: string;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.game.findUnique({
        where: { code: data.gameCode },
        include: { players: true },
      });

      if (!game) throw new AppError(404, '游戏不存在，请检查入场码');
      if (game.status !== 'WAITING') throw new AppError(400, '游戏已开始或已结束，无法加入');
      if (game.players.length >= game.playerCount) {
        throw new AppError(400, '游戏人数已满');
      }

      // 昵称格式校验
      const trimmedNickname = data.nickname.trim();
      if (!trimmedNickname || trimmedNickname.length > 10) {
        throw new AppError(400, '昵称长度需在1-10个字符之间');
      }

      // 检查同一IP是否已加入
      const existing = game.players.find((p) => p.clientIp === data.clientIp);
      if (existing) {
        return { player: formatPlayerInfo(existing), gameId: game.id };
      }

      const player = await tx.player.create({
        data: {
          gameId: game.id,
          clientIp: data.clientIp,
          nickname: data.nickname,
        },
      });

      return { player: formatPlayerInfo(player), gameId: game.id };
    });

    return result;
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(400, '你已经加入该游戏');
    }
    throw err;
  }
}
