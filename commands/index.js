// commands/index.js
import User from '../models/User.js';
import Reward from '../models/Reward.js';
import config from '../config/config.js';
import { calcLevel } from '../utils/xp.js';
import Mission from '../models/Mission.js';
import Team from '../models/Team.js';
import { missionPool } from '../config/missions.js';
import { getTitles } from '../utils/badges.js';

// ✅ ADMIN MẶC ĐỊNH – TELEGRAM ID CỦA BẠN
const DEFAULT_ADMINS = [
  5589888565 // sửa nếu ID bạn khác
];

// helper: key ngày YYYY-MM-DD
function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// helper: tìm user theo ID hoặc @username
async function findUserByArg(arg) {
  if (!arg) return null;

  // Nếu là ID
  if (/^\d+$/.test(arg)) {
    return await User.findOne({ telegramId: Number(arg) });
  }

  // Nếu là @username
  if (arg.startsWith('@')) {
    return await User.findOne({ username: arg.slice(1) });
  }

  return null;
}

// helper: check admin trong bot
async function isAdmin(userId) {
  // nếu là ID mặc định → auto admin
  if (DEFAULT_ADMINS.includes(userId)) return true;

  const u = await User.findOne({ telegramId: userId });
  return u && u.role === 'admin';
}


export default (bot) => {
  // Bot game: chỉ giữ các lệnh game, shop, daily, team/clan

bot.start(async (ctx) => {
  await ctx.reply(
    [
      'Xin chào! Đây là bot game 🎮',
      '',
      'Lệnh chính:',
      '• /roll <coin> – tung số với bot',
      '• /race <coin> – đua xe ngẫu nhiên',
      '• /hunt <coin> – săn quái, ăn XP/coin',
      '• /steal @user <coin> – trộm coin người khác',
      '• /quiz – quiz toán có thưởng/phạt',
      '• /taixiu <coin> – Tài / Xỉu / Chẵn / Lẻ',
      '',
      'Kinh tế / clan:',
      '• /daily, /claimdaily – thưởng mỗi ngày',
      '• /shop, /buy <id> – shop vật phẩm',
      '• /createteam, /jointeam, /leaveteam, /team, /teamtop – hệ thống team/clan'
    ].join('\n'),
    { reply_to_message_id: ctx.message?.message_id }
  );
});

  // ====== SHOP / SHOP / BUY ======
  // ================= SHOP =================

  bot.command('shop', async (ctx) => {
    let txt = '🎁 SHOP\n\n';
    config.shop.items.forEach(i => {
      txt += `• ${i.id} – ${i.name} – ${i.price} coin\n`;
    });
    await ctx.reply(txt, { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command('buy', async (ctx) => {
    const parts = ctx.message.text.split(' ').filter(Boolean);
    const id = parts[1];
    if (!id) {
      return ctx.reply('Sai cú pháp: /buy <id>', { reply_to_message_id: ctx.message?.message_id });
    }

    let user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu.', { reply_to_message_id: ctx.message?.message_id });
    }

    const item = config.shop.items.find(i => i.id === id);
    if (!item) {
      return ctx.reply('Không tìm thấy vật phẩm này.', { reply_to_message_id: ctx.message?.message_id });
    }
    if (user.topCoin < item.price) {
      return ctx.reply('Bạn không đủ coin.', { reply_to_message_id: ctx.message?.message_id });
    }

    user.topCoin -= item.price;

    // Box random
    if (item.type === 'box') {
      const rand = Math.random() * 100;
      let sum = 0;
      let rewardType = 'nothing';
      for (const r of config.shop.randomRewards) {
        sum += r.chance;
        if (rand <= sum) {
          rewardType = r.type;
          break;
        }
      }
      await Reward.create({ userId: user._id, type: rewardType });
      await user.save();
      return ctx.reply(
        `Bạn mở Box và nhận: ${rewardType === 'nothing' ? 'Hụt 😢' : rewardType}`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    }

    // Vật phẩm bình thường
    await Reward.create({ userId: user._id, type: item.type });
    await user.save();
    await ctx.reply(
      `Đã mua: ${item.name}. Quà sẽ do admin xử lý.`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  });

  // ====== DAILY / CLAIMDAILY / NHIỆM VỤ NGÀY ======
  // ================= NHIỆM VỤ: /daily & /claimdaily =================

  // /daily – điểm danh hằng ngày
  bot.command('daily', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      user = await User.create({
        telegramId: from.id,
        username: from.username || '',
        role: DEFAULT_ADMINS.includes(from.id) ? 'admin' : 'user'
      });
    }

    const todayKey = getDayKey();
    if (user.lastDailyAt === todayKey) {
      return ctx.reply(
        '📅 Hôm nay bạn đã điểm danh rồi, quay lại ngày mai nhé!',
        { reply_to_message_id: ctx.message?.message_id }
      );
    }

    // streak: nếu hôm qua có daily → +1, không thì reset = 1
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = getDayKey(yesterday);

    if (user.lastDailyAt === yKey) {
      user.dailyStreak += 1;
    } else {
      user.dailyStreak = 1;
    }

    user.lastDailyAt = todayKey;

    // thưởng daily
    const dailyXp = 10;
    const dailyCoin = 20;

    user.totalXP += dailyXp;
    user.dayXP += dailyXp;
    user.weekXP += dailyXp;
    user.monthXP += dailyXp;
    user.topCoin += dailyCoin;

    await user.save();

    const level = calcLevel(user.totalXP);

    await ctx.reply(
      `✅ Điểm danh thành công!\n` +
      `• +${dailyXp} XP\n` +
      `• +${dailyCoin} coin\n` +
      `• Streak: ${user.dailyStreak} ngày\n` +
      `• Level hiện tại: ${level} (XP: ${user.totalXP})`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  });

  // /claimdaily – nhiệm vụ chat đủ XP trong ngày
  bot.command('claimdaily', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply(
        'Bạn chưa có dữ liệu, hãy chat trong group trước.',
        { reply_to_message_id: ctx.message?.message_id }
      );
    }

    const todayKey = getDayKey();
    const requiredXpToday = 40; // cần 40 XP trong ngày để nhận thưởng
    const bonusXp = 30;
    const bonusCoin = 30;

    // đã claim hôm nay?
    if (user.lastDailyQuestKey === todayKey) {
      return ctx.reply(
        '🎯 Bạn đã nhận thưởng nhiệm vụ ngày hôm nay rồi.',
        { reply_to_message_id: ctx.message?.message_id }
      );
    }

    if (user.dayXP < requiredXpToday) {
      return ctx.reply(
        `Bạn mới có ${user.dayXP} XP hôm nay.\n` +
        `Cần ${requiredXpToday} XP trong ngày để nhận thưởng.`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    }

    user.lastDailyQuestKey = todayKey;

    user.totalXP += bonusXp;
    user.dayXP += bonusXp;
    user.weekXP += bonusXp;
    user.monthXP += bonusXp;
    user.topCoin += bonusCoin;

    await user.save();

    const level = calcLevel(user.totalXP);

    await ctx.reply(
      `🎉 Nhiệm vụ ngày hoàn thành!\n` +
      `• +${bonusXp} XP\n` +
      `• +${bonusCoin} coin\n` +
      `• Level hiện tại: ${level} (XP: ${user.totalXP})`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  });

  // ====== MINI GAME + QUIZ + DUEL + ROLL/RACE/HUNT/STEAL + TAIXIU ======
  // ========== MINI GAME ==========
   // ========== /ROLL – TUNG SỐ CÓ CƯỢC ==========
  bot.command('roll', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const bet = Number(parts[1]);

    if (isNaN(bet) || bet <= 0) {
      return ctx.reply('Dùng: /roll <coin_cược>', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu, hãy chat trong group trước.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    if ((user.topCoin || 0) < bet) {
      return ctx.reply('Bạn không đủ coin để cược.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const userRoll = Math.floor(Math.random() * 100) + 1;
    const botRoll  = Math.floor(Math.random() * 100) + 1;

    if (userRoll > botRoll) {
      user.topCoin = (user.topCoin || 0) + bet;
      await user.save();
      return ctx.reply(
        `🎲 Bạn: ${userRoll} • Bot: ${botRoll}\n🏆 Bạn thắng! +${bet} coin\n💰 Coin: ${user.topCoin}`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    } else if (userRoll < botRoll) {
      const before = user.topCoin || 0;
      const loss = Math.min(bet, before);
      user.topCoin = before - loss;
      await user.save();
      return ctx.reply(
        `🎲 Bạn: ${userRoll} • Bot: ${botRoll}\n💀 Bạn thua! -${loss} coin\n💰 Coin: ${user.topCoin}`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    } else {
      return ctx.reply(
        `🎲 Bạn: ${userRoll} • Bot: ${botRoll}\n⚖️ Hòa, không ai mất gì.`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    }
  });

    // ========== DUEL: ĐẤM / CHẮN / NÉ ==========
  // Lưu trạng thái trong RAM (restart bot sẽ mất)
  const duels = new Map(); // key: "minId:maxId" -> { challengerId, targetId, amount, challengerChoice, targetChoice }

  function getDuelKey(a, b) {
    return [a, b].sort().join(':');
  }

  function getOutcome(a, b) {
    if (a === b) return 'draw';

    // Attack thắng Dodge, Dodge thắng Shield, Shield thắng Attack
    if (a === 'attack' && b === 'dodge') return 'a';
    if (a === 'dodge' && b === 'shield') return 'a';
    if (a === 'shield' && b === 'attack') return 'a';

    return 'b';
  }

  async function resolveDuel(ctx, duel) {
    const { challengerId, targetId, amount, challengerChoice, targetChoice } = duel;

    const challenger = await User.findOne({ telegramId: challengerId });
    const target = await User.findOne({ telegramId: targetId });

    if (!challenger || !target) {
      return ctx.reply('Một trong hai người chơi không còn trong hệ thống.');
    }

    // kiểm tra lại coin lần nữa
    if ((challenger.topCoin || 0) < amount || (target.topCoin || 0) < amount) {
      return ctx.reply('Một trong hai người không đủ coin để tiếp tục.');
    }

    const result = getOutcome(challengerChoice, targetChoice);

    let text =
      '⚔️ KẾT QUẢ TRẬN ĐẤU\\n' +
      `${challenger.username || challenger.telegramId}: ${challengerChoice.toUpperCase()}\n` +
      `${target.username || target.telegramId}: ${targetChoice.toUpperCase()}\n\n`;

    if (result === 'draw') {
      text += '⚖️ Hòa, không ai mất coin.';
    } else {
      const winner = result === 'a' ? challenger : target;
      const loser = result === 'a' ? target : challenger;

      loser.topCoin -= amount;
      winner.topCoin = (winner.topCoin || 0) + amount;

      await loser.save();
      await winner.save();

      text += `🏆 Người thắng: ${winner.username || winner.telegramId} (+${amount} coin)`;
    }

    await ctx.reply(text);

    // xoá session
    const key = getDuelKey(challengerId, targetId);
    duels.delete(key);
  }

  bot.command('duel', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const userArg = parts[1];
    const amountStr = parts[2];

    if (!userArg || !amountStr) {
      return ctx.reply('Dùng: /duel @user <coin>', { reply_to_message_id: ctx.message?.message_id });
    }

    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Số coin không hợp lệ.', { reply_to_message_id: ctx.message?.message_id });
    }

    const challenger = await User.findOne({ telegramId: from.id });
    if (!challenger) {
      return ctx.reply('Bạn chưa có dữ liệu.', { reply_to_message_id: ctx.message?.message_id });
    }

    if ((challenger.topCoin || 0) < amount) {
      return ctx.reply('Bạn không đủ coin để đặt cược.', { reply_to_message_id: ctx.message?.message_id });
    }

    const targetMention = userArg.startsWith('@') ? userArg.slice(1) : userArg.replace('@', '');
    const target = await User.findOne({ username: targetMention });
    if (!target) {
      return ctx.reply('Không tìm thấy đối thủ (theo username).', { reply_to_message_id: ctx.message?.message_id });
    }

    if ((target.topCoin || 0) < amount) {
      return ctx.reply('Đối thủ không đủ coin để tham gia.', { reply_to_message_id: ctx.message?.message_id });
    }

    const key = getDuelKey(challenger.telegramId, target.telegramId);

    duels.set(key, {
      challengerId: challenger.telegramId,
      targetId: target.telegramId,
      amount,
      challengerChoice: null,
      targetChoice: null
    });

    await ctx.reply(
      [
        `⚔️ ${challenger.username || challenger.telegramId} thách đấu @${target.username} với ${amount} coin!`,
        '',
        'Mỗi bên hãy chọn một trong 3 lệnh dưới đây:',
        '/attack – Đấm (thắng /dodge)',
        '/shield – Chắn (thắng /attack)',
        '/dodge – Né (thắng /shield)'
      ].join('\n'),
      { reply_to_message_id: ctx.message?.message_id }
    );
  });

  async function handleDuelChoice(ctx, move) {
    const from = ctx.from;
    if (!from) return;

    // tìm duel có bạn tham gia
    let duel = null;
    let keyFound = null;
    for (const [key, d] of duels.entries()) {
      if (d.challengerId === from.id || d.targetId === from.id) {
        duel = d;
        keyFound = key;
        break;
      }
    }

    if (!duel) {
      return ctx.reply('Bạn không có trận duel nào đang diễn ra.', { reply_to_message_id: ctx.message?.message_id });
    }

    if (duel.challengerId === from.id && duel.challengerChoice) {
      return ctx.reply('Bạn đã chọn rồi, chờ đối thủ.', { reply_to_message_id: ctx.message?.message_id });
    }

    if (duel.targetId === from.id && duel.targetChoice) {
      return ctx.reply('Bạn đã chọn rồi, chờ đối thủ.', { reply_to_message_id: ctx.message?.message_id });
    }

    if (duel.challengerId === from.id) {
      duel.challengerChoice = move;
    } else if (duel.targetId === from.id) {
      duel.targetChoice = move;
    }

    await ctx.reply(`✅ Bạn đã chọn: ${move.toUpperCase()}`, { reply_to_message_id: ctx.message?.message_id });

    // nếu cả 2 đã chọn thì xử lý kết quả
    if (duel.challengerChoice && duel.targetChoice) {
      await resolveDuel(ctx, duel);
    } else {
      duels.set(keyFound, duel);
    }
  }

  bot.command('attack', async (ctx) => handleDuelChoice(ctx, 'attack'));
  bot.command('shield', async (ctx) => handleDuelChoice(ctx, 'shield'));
  bot.command('dodge', async (ctx) => handleDuelChoice(ctx, 'dodge'));

   // ========== QUIZ NÂNG CAO (NHIỀU BƯỚC, CÓ THỜI GIAN, CÓ TRỪ ĐIỂM) ==========

  const quizzes = new Map(); // key: telegramId -> { answer, expr, expiresAt, chatId }

  const QUIZ_DAILY_XP_LIMIT = 200; // tối đa XP cộng từ quiz mỗi ngày
  const QUIZ_GAIN_XP = 10;         // XP thưởng mỗi câu đúng
  const QUIZ_PENALTY_XP = 5;       // XP phạt khi sai/hết giờ
  const QUIZ_PENALTY_COINS = 5;    // coin phạt khi sai/hết giờ
  const QUIZ_TIMEOUT_MS = 30000;   // 30 giây

  function generateQuizByLevel(level) {
    // level thấp: phép đơn giản
    if (level < 10) {
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const ops = ['+', '-'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      let expr, answer;

      if (op === '+') {
        expr = `${a} + ${b}`;
        answer = a + b;
      } else {
        const x = Math.max(a, b);
        const y = Math.min(a, b);
        expr = `${x} - ${y}`;
        answer = x - y;
      }

      return { expr, answer };
    }

    // level trung bình: 2–3 bước, có nhân/trừ
    if (level < 30) {
      const pattern = Math.floor(Math.random() * 3); // 0,1,2
      let a, b, c, expr, answer;

      switch (pattern) {
        case 0: // a * b + c
          a = Math.floor(Math.random() * 10) + 2;
          b = Math.floor(Math.random() * 10) + 2;
          c = Math.floor(Math.random() * 20) + 1;
          expr = `${a} × ${b} + ${c}`;
          answer = a * b + c;
          break;
        case 1: // a + b * c
          a = Math.floor(Math.random() * 20) + 1;
          b = Math.floor(Math.random() * 10) + 2;
          c = Math.floor(Math.random() * 5) + 2;
          expr = `${a} + ${b} × ${c}`;
          answer = a + b * c;
          break;
        default: // (a + b) - c
          a = Math.floor(Math.random() * 30) + 5;
          b = Math.floor(Math.random() * 20) + 1;
          c = Math.floor(Math.random() * 15) + 1;
          const sum = a + b;
          if (c > sum) c = Math.floor(sum / 2);
          expr = `(${a} + ${b}) - ${c}`;
          answer = a + b - c;
          break;
      }

      return { expr, answer };
    }

    // level cao: biểu thức nhiều bước, có ngoặc, nhân/chia
    const pattern = Math.floor(Math.random() * 4); // 0..3
    let a, b, c, d, expr, answer;

    switch (pattern) {
      case 0: // (a * b) + (c * d)
        a = Math.floor(Math.random() * 10) + 2;
        b = Math.floor(Math.random() * 10) + 2;
        c = Math.floor(Math.random() * 10) + 2;
        d = Math.floor(Math.random() * 10) + 2;
        expr = `(${a} × ${b}) + (${c} × ${d})`;
        answer = a * b + c * d;
        break;

      case 1: // (a + b) * c
        a = Math.floor(Math.random() * 20) + 1;
        b = Math.floor(Math.random() * 20) + 1;
        c = Math.floor(Math.random() * 10) + 2;
        expr = `(${a} + ${b}) × ${c}`;
        answer = (a + b) * c;
        break;

      case 2: // (a * b) - (c + d)
        a = Math.floor(Math.random() * 10) + 3;
        b = Math.floor(Math.random() * 10) + 3;
        c = Math.floor(Math.random() * 10) + 1;
        d = Math.floor(Math.random() * 10) + 1;
        const prod = a * b;
        const sumCD = c + d;
        if (sumCD > prod - 1) {
          c = 1;
          d = Math.min(5, prod - 2);
        }
        expr = `(${a} × ${b}) - (${c} + ${d})`;
        answer = a * b - (c + d);
        break;

      default: // (b ÷ c) + d  (chia ra số nguyên)
        c = Math.floor(Math.random() * 9) + 2;      // 2..10
        const tmp = Math.floor(Math.random() * 10) + 2; // 2..11
        b = c * tmp; // để (b ÷ c) = tmp
        d = Math.floor(Math.random() * 20) + 1;
        expr = `(${b} ÷ ${c}) + ${d}`;
        answer = tmp + d;
        break;
    }

    return { expr, answer };
  }

  // dùng trực tiếp biến `bot` ở ngoài, không dùng ctx.bot nữa
  async function applyQuizPenalty(user, chatId, reasonText) {
    const beforeXP = user.totalXP || 0;
    const xpLoss = Math.min(QUIZ_PENALTY_XP, beforeXP);

    user.totalXP = beforeXP - xpLoss;
    user.dayXP   = Math.max(0, (user.dayXP   || 0) - xpLoss);
    user.weekXP  = Math.max(0, (user.weekXP  || 0) - xpLoss);
    user.monthXP = Math.max(0, (user.monthXP || 0) - xpLoss);

    const beforeCoin = user.topCoin || 0;
    const coinLoss = Math.min(QUIZ_PENALTY_COINS, beforeCoin);
    user.topCoin = beforeCoin - coinLoss;

    await user.save();

    const text =
      `${reasonText}\n` +
      `🔻 Phạt: -${xpLoss} XP, -${coinLoss} coin\n` +
      `📊 XP hiện tại: ${user.totalXP} • Coin: ${user.topCoin}`;

    await bot.telegram.sendMessage(chatId, text);
  }

  bot.command('quiz', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu trong hệ thống.');
    }

    const today = new Date().toISOString().slice(0, 10);

    if (!user.quizXp) {
      user.quizXp = { date: today, xp: 0 };
    }
    if (user.quizXp.date !== today) {
      user.quizXp = { date: today, xp: 0 };
    }

    if (user.quizXp.xp >= QUIZ_DAILY_XP_LIMIT) {
      return ctx.reply(`🚫 Bạn đã đạt giới hạn ${QUIZ_DAILY_XP_LIMIT} XP từ /quiz trong hôm nay.`);
    }

    const level = calcLevel(user.totalXP || 0);
    const { expr, answer } = generateQuizByLevel(level);

    const expiresAt = Date.now() + QUIZ_TIMEOUT_MS;

    quizzes.set(from.id, {
      answer,
      expr,
      expiresAt,
      chatId: ctx.chat.id
    });

    // hẹn giờ xử lý hết thời gian
    setTimeout(async () => {
      const current = quizzes.get(from.id);
      if (!current) return; // đã trả lời rồi

      if (current.expiresAt <= Date.now()) {
        quizzes.delete(from.id);

        const u = await User.findOne({ telegramId: from.id });
        if (!u) return;

        await applyQuizPenalty(u, current.chatId, '⏱ Hết thời gian trả lời /quiz.');
      }
    }, QUIZ_TIMEOUT_MS + 500);

    return ctx.reply(
      [
        `🧠 Câu hỏi cho bạn (Level ${level}):`,
        '',
        `${expr} = ?`,
        '',
        `⏱ Bạn có ${QUIZ_TIMEOUT_MS / 1000} giây để trả lời.`,
        'Trả lời bằng cách gửi *mỗi số thôi* (không kèm chữ).'
      ].join('\n'),
      { parse_mode: 'Markdown' }
    );
  });

  // Bắt mọi text để check câu trả lời quiz
  bot.on('text', async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();

    const quiz = quizzes.get(from.id);
    if (!quiz) return next(); // không có quiz đang chờ -> cho handler khác xử lý

    const raw = (ctx.message.text || '').trim();
    const val = Number(raw);
    if (isNaN(val)) return next();

    quizzes.delete(from.id); // mỗi quiz chỉ trả lời 1 lần

    const user = await User.findOne({ telegramId: from.id });
    if (!user) return next();

    const today = new Date().toISOString().slice(0, 10);

    if (!user.quizXp) {
      user.quizXp = { date: today, xp: 0 };
    }
    if (user.quizXp.date !== today) {
      user.quizXp = { date: today, xp: 0 };
    }

    // nếu đã hết thời gian mà vẫn trả lời → tính là timeout + phạt
    if (Date.now() > quiz.expiresAt) {
      await applyQuizPenalty(user, ctx.chat.id, '⏱ Bạn trả lời quá trễ.');
      return;
    }

    // trả lời đúng
    if (val === quiz.answer) {
      if (user.quizXp.xp >= QUIZ_DAILY_XP_LIMIT) {
        return ctx.reply(`🚫 Bạn đã đạt giới hạn ${QUIZ_DAILY_XP_LIMIT} XP từ /quiz trong hôm nay.`);
      }

      const xpCanGain = Math.min(
        QUIZ_GAIN_XP,
        QUIZ_DAILY_XP_LIMIT - user.quizXp.xp
      );

      user.quizXp.xp += xpCanGain;

      user.totalXP = (user.totalXP || 0) + xpCanGain;
      user.dayXP   = (user.dayXP   || 0) + xpCanGain;
      user.weekXP  = (user.weekXP  || 0) + xpCanGain;
      user.monthXP = (user.monthXP || 0) + xpCanGain;

      await user.save();

      return ctx.reply(
        [
          `🎉 Chính xác! +${xpCanGain} XP`,
          `📌 XP quiz hôm nay: ${user.quizXp.xp}/${QUIZ_DAILY_XP_LIMIT}`
        ].join('\n')
      );
    }

    // trả lời sai
    await applyQuizPenalty(user, ctx.chat.id, '❌ Bạn trả lời sai /quiz.');
    return;
  });

  // ================== MINI GAME: /race /hunt /steal ==================

  // /RACE – ĐUA XE CÓ CƯỢC
  bot.command('race', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const bet = Number(parts[1]);

    if (isNaN(bet) || bet <= 0) {
      return ctx.reply('Dùng: /race <coin_cược>', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu, hãy chat trong group trước.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    if ((user.topCoin || 0) < bet) {
      return ctx.reply('Bạn không đủ coin để cược.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const vehicles = ['🚗 Xe đỏ', '🏎️ Siêu xe', '🚓 Cảnh sát', '🛵 Xe máy', '🐌 Ốc sên'];
    const myVehicle = vehicles[Math.floor(Math.random() * vehicles.length)];

    const win = Math.random() >= 0.5;

    let text = '🏁 ĐUA XE BẮT ĐẦU\n' + `Bạn lái: ${myVehicle}\n\n`;

    if (win) {
      user.topCoin = (user.topCoin || 0) + bet;
      await user.save();
      text +=
        `🏆 Bạn THẮNG! +${bet} coin\n` +
        `💰 Coin hiện tại: ${user.topCoin}`;
    } else {
      const before = user.topCoin || 0;
      const loss = Math.min(bet, before);
      user.topCoin = before - loss;
      await user.save();
      text +=
        `💀 Bạn THUA! -${loss} coin\n` +
        `💰 Coin hiện tại: ${user.topCoin}`;
    }

    await ctx.reply(text, { reply_to_message_id: ctx.message?.message_id });
  });

  // /HUNT – SĂN QUÁI CÓ CƯỢC (THƯỞNG/PẠT XP)
  bot.command('hunt', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const bet = Number(parts[1]);

    if (isNaN(bet) || bet <= 0) {
      return ctx.reply('Dùng: /hunt <coin_cược>', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu, hãy chat trong group trước.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    if ((user.topCoin || 0) < bet) {
      return ctx.reply('Bạn không đủ coin để cược.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const monsters = [
      '🐺 Sói hoang',
      '🐉 Rồng mini',
      '🧟‍♂️ Thây ma lang thang',
      '🦇 Dơi đêm',
      '👹 Quỷ lùn'
    ];
    const monster = monsters[Math.floor(Math.random() * monsters.length)];

    const winChance = 0.6;
    const isWin = Math.random() < winChance;

    let text = `🎯 Bạn bắt gặp: ${monster}\n`;

    if (isWin) {
      const gainXP = Math.floor(bet * 1.5);

      user.totalXP = (user.totalXP || 0) + gainXP;
      user.dayXP   = (user.dayXP   || 0) + gainXP;
      user.weekXP  = (user.weekXP  || 0) + gainXP;
      user.monthXP = (user.monthXP || 0) + gainXP;

      const level = calcLevel(user.totalXP || 0);

      await user.save();

      text +=
        '⚔️ Bạn hạ gục con quái!\n' +
        `✅ Thưởng: +${gainXP} XP\n` +
        `📊 XP: ${user.totalXP} (Level ${level})`;
    } else {
      const lossXP = Math.floor(bet * 0.5);
      const beforeXP = user.totalXP || 0;
      const xpLoss = Math.min(lossXP, beforeXP);

      user.totalXP = beforeXP - xpLoss;
      user.dayXP   = Math.max(0, (user.dayXP   || 0) - xpLoss);
      user.weekXP  = Math.max(0, (user.weekXP  || 0) - xpLoss);
      user.monthXP = Math.max(0, (user.monthXP || 0) - xpLoss);

      const level = calcLevel(user.totalXP || 0);

      await user.save();

      text +=
        '💀 Quái phản dame, bạn bị thương.\n' +
        `🔻 Phạt: -${xpLoss} XP\n` +
        `📊 XP: ${user.totalXP} (Level ${level})`;
    }

    await ctx.reply(text, { reply_to_message_id: ctx.message?.message_id });
  });

  // /STEAL – TRỘM COIN (50% THÀNH CÔNG, CÓ COOLDOWN)
  const stealCooldown = new Map(); // key: telegramId -> timestamp ms
  const STEAL_COOLDOWN_MS = 60 * 60 * 1000; // 1 giờ

  bot.command('steal', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').filter(Boolean);
    const userArg = parts[1];
    const amountStr = parts[2];

    if (!userArg || !amountStr) {
      return ctx.reply('Dùng: /steal <@username|telegramId> <số_coin>', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('Số coin không hợp lệ.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const now = Date.now();
    const last = stealCooldown.get(from.id) || 0;
    if (now - last < STEAL_COOLDOWN_MS) {
      const remain = STEAL_COOLDOWN_MS - (now - last);
      const minutes = Math.ceil(remain / 60000);
      return ctx.reply(
        `⏳ Bạn phải đợi khoảng ${minutes} phút nữa mới được /steal tiếp.`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    }

    const thief = await User.findOne({ telegramId: from.id });
    if (!thief) {
      return ctx.reply('Bạn chưa có dữ liệu trong hệ thống.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    let target;
    if (userArg.startsWith('@')) {
      const uname = userArg.slice(1);
      target = await User.findOne({ username: uname });
    } else {
      const idNum = Number(userArg);
      if (!isNaN(idNum)) {
        target = await User.findOne({ telegramId: idNum });
      }
    }

    if (!target) {
      return ctx.reply('Không tìm thấy người để trộm (theo username/ID).', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    if (target.telegramId === thief.telegramId) {
      return ctx.reply('Bạn không thể tự trộm coin của chính mình 🤨', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const thiefCoin = thief.topCoin || 0;
    const targetCoin = target.topCoin || 0;

    if (thiefCoin <= 0) {
      return ctx.reply('Bạn không có coin, trộm thất bại là bạn đi bụi luôn đó 😅', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    if (targetCoin <= 0) {
      return ctx.reply('Người này không có coin để trộm.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    stealCooldown.set(from.id, now);

    const success = Math.random() < 0.30;

    if (success) {
      const stealAmount = Math.min(amount, targetCoin);

      target.topCoin = targetCoin - stealAmount;
      thief.topCoin = thiefCoin + stealAmount;

      await target.save();
      await thief.save();

      const text =
        '🕵️ Phi vụ trộm coin\n' +
        `🎯 Mục tiêu: ${target.username || target.telegramId}\n` +
        `✅ Thành công! Bạn trộm được ${stealAmount} coin\n\n` +
        `💰 Coin của bạn: ${thief.topCoin}\n` +
        `💸 Coin của mục tiêu: ${target.topCoin}`;

      return ctx.reply(text, { reply_to_message_id: ctx.message?.message_id });
    } else {
      const penalty = Math.min(Math.floor(amount / 2), thiefCoin);

      thief.topCoin = thiefCoin - penalty;
      await thief.save();

      const text =
        '🕵️ Phi vụ trộm coin\n' +
        `🎯 Mục tiêu: ${target.username || target.telegramId}\n` +
        '💀 Bạn bị bắt quả tang khi đang trộm!\n' +
        `🔻 Bị phạt: -${penalty} coin\n` +
        `💰 Coin hiện tại của bạn: ${thief.topCoin}`;

      return ctx.reply(text, { reply_to_message_id: ctx.message?.message_id });
    }
  });
  // ====== STATE CHO GAME TÀI/XỈU ======
const taiXiuSessions = new Map(); // key: telegramId -> { bet, chatId }

// ========== /TAIXIU – ĐẶT CƯỢC VÀ CHỌN CỬA ==========
bot.command('taixiu', async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const parts = ctx.message.text.split(' ').filter(Boolean);
  const bet = Number(parts[1]);

  if (isNaN(bet) || bet <= 0) {
    return ctx.reply('Dùng: /taixiu <coin_cược>', {
      reply_to_message_id: ctx.message?.message_id
    });
  }

  const user = await User.findOne({ telegramId: from.id });
  if (!user) {
    return ctx.reply('Bạn chưa có dữ liệu, hãy chat trong group trước.', {
      reply_to_message_id: ctx.message?.message_id
    });
  }

  if ((user.topCoin || 0) < bet) {
    return ctx.reply('Bạn không đủ coin để cược.', {
      reply_to_message_id: ctx.message?.message_id
    });
  }

  // lưu phiên chơi
  taiXiuSessions.set(from.id, {
    bet,
    chatId: ctx.chat.id
  });

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Tài (11–17)', callback_data: 'taixiu:tai' },
          { text: 'Xỉu (4–10)', callback_data: 'taixiu:xiu' }
        ],
        [
          { text: 'Chẵn', callback_data: 'taixiu:chan' },
          { text: 'Lẻ',  callback_data: 'taixiu:le' }
        ]
      ]
    }
  };

  await ctx.reply(
    `🎲 Bạn cược *${bet} coin*.\nChọn cửa muốn đặt:`,
    { parse_mode: 'Markdown', ...keyboard }
  );
});

// ========== XỬ LÝ KẾT QUẢ TÀI/XỈU (CALLBACK) ==========
bot.on('callback_query', async (ctx) => {
  const cb = ctx.callbackQuery;
  const data = cb?.data || '';
  const from = ctx.from;
  if (!from) {
    return ctx.answerCbQuery();
  }

  // chỉ xử lý callback bắt đầu bằng 'taixiu:'
  if (!data.startsWith('taixiu:')) {
    return ctx.answerCbQuery();
  }

  const choice = data.split(':')[1]; // tai | xiu | chan | le
  await ctx.answerCbQuery(); // tắt loading trên nút

  const session = taiXiuSessions.get(from.id);
  if (!session) {
    return ctx.reply('⚠️ Bạn chưa đặt cược /taixiu hoặc phiên đã hết, hãy gõ lại lệnh.', {
      reply_to_message_id: cb.message?.message_id
    });
  }

  taiXiuSessions.delete(from.id);

  const user = await User.findOne({ telegramId: from.id });
  if (!user) {
    return ctx.reply('Bạn chưa có dữ liệu trong hệ thống.', {
      reply_to_message_id: cb.message?.message_id
    });
  }

  const bet = session.bet;
  if ((user.topCoin || 0) < bet) {
    return ctx.reply('Bạn không đủ coin để hoàn tất ván này, cược bị hủy.', {
      reply_to_message_id: cb.message?.message_id
    });
  }

  // NÉM 3 XÚC XẮC
  const rollDie = () => Math.floor(Math.random() * 6) + 1;
  const diceToIcon = (v) => ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v - 1];

  const d1 = rollDie();
  const d2 = rollDie();
  const d3 = rollDie();
  const sum = d1 + d2 + d3;

  const iconLine = `${diceToIcon(d1)} ${diceToIcon(d2)} ${diceToIcon(d3)}`;
  const isTai  = sum >= 11;
  const isXiu  = sum <= 10;
  const isChan = sum % 2 === 0;
  const isLe   = !isChan;

  let resultText = `🎲 KẾT QUẢ TÀI/XỈU\n${iconLine} = ${sum}\n\n`;

  let win = false;

  if (choice === 'tai'  && isTai)  win = true;
  if (choice === 'xiu'  && isXiu)  win = true;
  if (choice === 'chan' && isChan) win = true;
  if (choice === 'le'   && isLe)   win = true;

  const choiceLabel = {
    tai: 'Tài',
    xiu: 'Xỉu',
    chan: 'Chẵn',
    le: 'Lẻ'
  }[choice] || 'Không rõ';

  resultText += `Tổng: ${sum} → ${isTai ? 'Tài' : 'Xỉu'} • ${isChan ? 'Chẵn' : 'Lẻ'}\n`;
  resultText += `Bạn chọn: *${choiceLabel}*\n\n`;

  if (win) {
    // lãi ≈ 1.8x tiền cược (vd 5 → 9 coin, không cộng vốn)
    const profit = Math.floor(bet * 1.8);
    user.topCoin = (user.topCoin || 0) + profit;
    await user.save();

    resultText +=
      `✅ Bạn THẮNG! +${profit} coin (không tính lại tiền cược)\n` +
      `💰 Coin hiện tại: ${user.topCoin}`;
  } else {
    const before = user.topCoin || 0;
    const loss = Math.min(bet, before);
    user.topCoin = before - loss;
    await user.save();

    resultText +=
      `❌ Bạn THUA! -${loss} coin (mất tiền cược)\n` +
      `💰 Coin hiện tại: ${user.topCoin}`;
  }

  await ctx.reply(resultText, {
    parse_mode: 'Markdown',
    reply_to_message_id: cb.message?.message_id
  });
});

  // ====== TEAM / CLAN ======
  // ========== TEAM / CLAN ==========
  bot.command('createteam', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').slice(1);
    const name = parts.join(' ').trim();

    if (!name) {
      return ctx.reply('Dùng: /createteam <tên team>', { reply_to_message_id: ctx.message?.message_id });
    }

    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu.', { reply_to_message_id: ctx.message?.message_id });
    }

    if (user.teamId) {
      return ctx.reply('Bạn đã thuộc 1 team, hãy /leaveteam trước.', { reply_to_message_id: ctx.message?.message_id });
    }

    const exist = await Team.findOne({ name });
    if (exist) {
      return ctx.reply('Tên team đã tồn tại.', { reply_to_message_id: ctx.message?.message_id });
    }

    const team = await Team.create({
      name,
      createdBy: user._id
    });

    user.teamId = team._id;
    await user.save();

    await ctx.reply(`✅ Đã tạo team "${name}" và bạn đã join.`, { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command('jointeam', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const parts = ctx.message.text.split(' ').slice(1);
    const name = parts.join(' ').trim();

    if (!name) {
      return ctx.reply('Dùng: /jointeam <tên team>', { reply_to_message_id: ctx.message?.message_id });
    }

    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu.', { reply_to_message_id: ctx.message?.message_id });
    }

    const team = await Team.findOne({ name });
    if (!team) {
      return ctx.reply('Không tìm thấy team.', { reply_to_message_id: ctx.message?.message_id });
    }

    user.teamId = team._id;
    await user.save();

    await ctx.reply(`✅ Bạn đã gia nhập team "${name}".`, { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command('leaveteam', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu.', { reply_to_message_id: ctx.message?.message_id });
    }

    if (!user.teamId) {
      return ctx.reply('Bạn không thuộc team nào.', { reply_to_message_id: ctx.message?.message_id });
    }

    user.teamId = null;
    await user.save();

    await ctx.reply('✅ Bạn đã rời khỏi team.', { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command('team', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    let user = await User.findOne({ telegramId: from.id }).populate('teamId');
    if (!user) {
      return ctx.reply('Bạn chưa có dữ liệu.', { reply_to_message_id: ctx.message?.message_id });
    }

    if (!user.teamId) {
      return ctx.reply('Bạn chưa thuộc team nào. Dùng /createteam hoặc /jointeam.', { reply_to_message_id: ctx.message?.message_id });
    }

    const team = user.teamId;

    const members = await User.find({ teamId: team._id }).sort({ totalXP: -1 }).limit(10);

    let text = `👥 Team: ${team.name}\n`;
    text += `Thành viên: ${members.length}\n\n`;

    members.forEach((m, i) => {
      const lv = calcLevel(m.totalXP || 0);
      const name = m.username ? '@' + m.username : 'ID ' + m.telegramId;
      text += `${i + 1}. ${name} – Level ${lv} (${m.totalXP} XP)\n`;
    });

    await ctx.reply(text, { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command('teamtop', async (ctx) => {
    const teams = await Team.find();
    if (!teams.length) {
      return ctx.reply('Chưa có team nào.', { reply_to_message_id: ctx.message?.message_id });
    }

    const aggregates = [];
    for (const t of teams) {
      const members = await User.find({ teamId: t._id });
      const totalXP = members.reduce((sum, u) => sum + (u.totalXP || 0), 0);
      aggregates.push({ team: t, totalXP });
    }

    aggregates.sort((a, b) => b.totalXP - a.totalXP);

    let text = '🏆 TOP TEAM\n\n';
    aggregates.slice(0, 10).forEach((item, i) => {
      text += `${i + 1}. ${item.team.name} – ${item.totalXP} XP\n`;
    });

    await ctx.reply(text, { reply_to_message_id: ctx.message?.message_id });
  });

};