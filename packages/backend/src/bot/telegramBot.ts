import { Bot, InlineKeyboard } from 'grammy';
import { BlindBoxStatus, type PrismaClient } from '@prisma/client';
import { BOX_REWARD_SPLIT } from '@pop-box/shared';
import { env } from '../config/env.js';
import type { KVStore } from '../lib/redis.js';

const WHALE_GROUP_MIN_MEMBERS = 500;
const WHALE_GROUP_MIN_ACTIVE_3D = 30;
const TIER_LABELS: Record<number, string> = {
  0: '青苹果',
  1: '黄香蕉',
  2: '橙子',
};

export interface PopTelegramBotDeps {
  prisma: PrismaClient;
  kv: KVStore;
  botToken?: string;
  miniAppUrl?: string;
}

export function createPopTelegramBot(deps: PopTelegramBotDeps): Bot {
  const token = deps.botToken ?? env.TELEGRAM_BOT_TOKEN;
  const miniAppUrl = deps.miniAppUrl ?? env.TELEGRAM_MINIAPP_URL;
  const bot = new Bot(token);

  // /start — Welcome + launch TMA
  bot.command('start', async (ctx) => {
    const kb = new InlineKeyboard().url('🍏 打开 POP 果实 果园', miniAppUrl);
    await ctx.reply(
      '🎉 欢迎来到 **POP 果实 ($POP)**！\n\n' +
        '• 0 门槛阅读 X / 币安广场好帖答 1 题，实时瓜分 `$POP`\n' +
        '• 群主拉 Bot 进群输入 `/bind_group` 绑定群聊，满 500 人且 3 日活跃 ≥ 30 人自动获橙子认购资格\n' +
        '• 在群内输入 `/pop <boxId>` 一键发阅读邀请\n' +
        '• 输入 `/stats` 查看本群活跃度与引导点击战绩',
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  // /bind_group — Bind Telegram group to caller's POP 果实 user account
  bot.command('bind_group', async (ctx) => {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
      await ctx.reply('⚠️ 请在需要绑定的 Telegram 群聊内执行 `/bind_group`。', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const fromId = ctx.from?.id;
    if (!fromId) return;

    // Verify caller is group admin/creator
    try {
      const member = await ctx.getChatMember(fromId);
      if (member.status !== 'creator' && member.status !== 'administrator') {
        await ctx.reply('⚠️ 仅群主或群管理员可执行 `/bind_group` 绑定。', {
          parse_mode: 'Markdown',
        });
        return;
      }
    } catch {
      await ctx.reply('⚠️ 无法校验群管理员权限，请确保已将 Bot 设为群管理员。');
      return;
    }

    const chatId = String(ctx.chat.id);
    const title = 'title' in ctx.chat ? ctx.chat.title : 'POP 果实 Group';
    const memberCount = await ctx.getChatMemberCount().catch(() => 0);

    const ownerUser = await deps.prisma.user.upsert({
      where: { telegramId: String(fromId) },
      create: {
        telegramId: String(fromId),
        telegramUsername: ctx.from?.username ?? null,
      },
      update: {
        telegramUsername: ctx.from?.username ?? undefined,
      },
    });

    const existing = await deps.prisma.tgGroup.findUnique({ where: { chatId } });
    const activeUsers3d = existing?.activeUsers3d ?? 0;
    const whitelistGranted =
      memberCount >= WHALE_GROUP_MIN_MEMBERS && activeUsers3d >= WHALE_GROUP_MIN_ACTIVE_3D;

    await deps.prisma.tgGroup.upsert({
      where: { chatId },
      create: {
        chatId,
        title,
        ownerUserId: ownerUser.id,
        memberCount,
        activeUsers3d,
        whitelistGranted,
      },
      update: {
        title,
        ownerUserId: ownerUser.id,
        memberCount,
        whitelistGranted,
      },
    });

    await ctx.reply(
      `✅ 群聊 **${title}** 绑定成功！\n` +
        `• 当前成员数：\`${memberCount}\`\n` +
        `• 近 3 日活跃独立发言：\`${activeUsers3d}\`\n` +
        `• 橙子认购资格状态：${whitelistGranted ? '🍊 已达标授予' : '⏳ 需满 500 人且 3 日活跃 ≥ 30 人'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /pop <boxId> — Push an ACTIVE blind box card with TMA deep-link button
  bot.command('pop', async (ctx) => {
    const boxId = ctx.match?.trim();
    if (!boxId) {
      await ctx.reply('用法：`/pop <boxId>`（在“我的资产”页面复制已激活果实 ID）', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const box = await deps.prisma.blindBox.findUnique({ where: { id: boxId } });
    if (!box || box.status !== BlindBoxStatus.ACTIVE || box.claimedClicks >= box.maxClicks || (box.expiresAt && box.expiresAt <= new Date())) {
      await ctx.reply('❌ 未找到该活跃果实，或果实已领完/过期。');
      return;
    }

    const remaining = Math.max(0, box.maxClicks - box.claimedClicks);
    const readerPop = box.totalPopAmount
      .mul(BOX_REWARD_SPLIT.READER_CLICK_TOTAL_PCT)
      .div(100)
      .div(box.maxClicks)
      .toDecimalPlaces(2)
      .toString();

    const chatParam = ctx.chat ? `_grp_${ctx.chat.id}` : '';
    const tmaLink = `${miniAppUrl}${miniAppUrl.includes('?') ? '&' : '?'}startapp=box_${box.id}${chatParam}`;

    const kb = new InlineKeyboard().url(`🍏 POP 一下领 +${readerPop} $POP`, tmaLink);
    if (box.targetUrl) {
      kb.row().url('📖 先看原帖内容', box.targetUrl);
    }

    const tierLabel = TIER_LABELS[box.tierId] ?? `Tier ${box.tierId}`;
    const platformLabel = box.platform === 'BINANCE_SQUARE' ? '币安广场' : 'X (Twitter)';

    await ctx.reply(
      `🔥 **POP 果实阅读邀请** | ${tierLabel}\n\n` +
        `📌 主题：${box.contentTitle ?? '精选热帖'}\n` +
        `🌐 平台：${platformLabel}\n` +
        `💰 单人答对即领：**+${readerPop} $POP**\n` +
        `🎯 剩余名额：**${remaining} / ${box.maxClicks}**\n` +
        `⏰ 过期时间：${box.expiresAt ? box.expiresAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '72h'}\n\n` +
        `👇 点击下方按钮阅读 5 秒并答对 1 道极简题，实时瓜分 $POP！`,
      { parse_mode: 'Markdown', reply_markup: kb }
    );
  });

  // /stats — Show group activity & clicks driven
  bot.command('stats', async (ctx) => {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
      await ctx.reply('⚠️ 请在已绑定的群聊内使用 `/stats`。', { parse_mode: 'Markdown' });
      return;
    }

    const chatId = String(ctx.chat.id);
    const group = await deps.prisma.tgGroup.findUnique({ where: { chatId } });
    if (!group) {
      await ctx.reply('⚠️ 本群尚未绑定，请由群管理员先发送 `/bind_group`。', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const liveMembers = await ctx.getChatMemberCount().catch(() => group.memberCount);
    if (liveMembers !== group.memberCount) {
      await deps.prisma.tgGroup.update({
        where: { chatId },
        data: { memberCount: liveMembers },
      });
    }

    await ctx.reply(
      `📊 **${group.title ?? '本群'} POP 果实 战绩看板**\n\n` +
        `👥 群成员数：\`${liveMembers}\`\n` +
        `💬 近 3 日活跃独立发言：\`${group.activeUsers3d}\`\n` +
        `🍏 累计引导成功领取：\`${group.totalClicksDriven}\`\n` +
        `🍊 橙子认购资格资格：${group.whitelistGranted ? '✅ 已获得' : '⏳ 未达标（需 500 人 + 30 活跃）'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // Track unique speakers over 3-day window in bound groups
  bot.on('message', async (ctx) => {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) return;
    if (!ctx.from || ctx.from.is_bot) return;

    const chatId = String(ctx.chat.id);
    const key = `tg:active3d:${chatId}`;
    const raw = await deps.kv.get(key);
    const speakerSet = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    const speakerId = String(ctx.from.id);

    if (!speakerSet.has(speakerId)) {
      speakerSet.add(speakerId);
      await deps.kv.set(key, JSON.stringify(Array.from(speakerSet)), 3 * 86400);

      const group = await deps.prisma.tgGroup.findUnique({ where: { chatId } });
      if (group) {
        const activeCount = speakerSet.size;
        const qualified =
          group.memberCount >= WHALE_GROUP_MIN_MEMBERS &&
          activeCount >= WHALE_GROUP_MIN_ACTIVE_3D;
        await deps.prisma.tgGroup.update({
          where: { chatId },
          data: {
            activeUsers3d: activeCount,
            whitelistGranted: group.whitelistGranted || qualified,
          },
        });
      }
    }
  });

  return bot;
}
