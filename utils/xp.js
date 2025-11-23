// utils/xp.js
import User from '../models/User.js';
import config from '../config/config.js';
import { ensureDailyMission, updateMissionProgress } from '../modules/missionSystem.js';

// ✅ ADMIN MẶC ĐỊNH – TELEGRAM ID CỦA BẠN
const DEFAULT_ADMINS = [
  5589888565
];

// Tính key ngày: YYYY-MM-DD
function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Tính key phút: YYYY-MM-DDTHH:MM
function getMinuteKey(date = new Date()) {
  return date.toISOString().slice(0, 16);
}

// Hàm tính level theo XP
export function calcLevel(xp) {
  const lv = Math.floor(Math.sqrt(xp / 5));
  return lv < 1 ? 1 : lv;
}

// Middleware chính – dùng trong bot.use(xpHandler)
export default async (ctx, next) => {
  if (!ctx.message) return next();
  const msg = ctx.message;
  const from = msg.from;
  if (!from || from.is_bot) return next();

  const text = msg.text || msg.caption || '';
  if (!text) return next();

  // ❗ Chỉ xử lý trong group / supergroup
  if (!msg.chat || (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup')) {
    return next();
  }

  const now = new Date();
  const trimmed = text.trim();

  let user = await User.findOne({ telegramId: from.id });
  if (!user) {
    user = await User.create({
      telegramId: from.id,
      username: from.username || '',
      role: DEFAULT_ADMINS.includes(from.id) ? 'admin' : 'user'
    });
  }

  // ✅ mỗi tin nhắn trong group đếm 1 lần
  user.messageCount = (user.messageCount || 0) + 1;

  // Nhiệm vụ ngày
  await ensureDailyMission(user._id);
  await updateMissionProgress(user, ctx);

  if (user.banned) return next();

  // ========== CỘNG XP VỚI GIỚI HẠN PHÚT / NGÀY ==========

  // Tin quá ngắn hoặc không có chữ/số → không tính XP
  if (trimmed.length < 5 || !/[a-zA-Z0-9À-ỹ]/.test(trimmed)) {
    user.lastMessageText = trimmed;
    user.lastMessageAt = now;
    await user.save();
    return next();
  }

  const dayKey = getDayKey(now);
  const minuteKey = getMinuteKey(now);

  // Reset dayXP nếu sang ngày mới
  if (user.dayKey !== dayKey) {
    user.dayKey = dayKey;
    user.dayXP = 0;
  }

  // Reset minuteXP nếu sang phút mới
  if (user.minuteKey !== minuteKey) {
    user.minuteKey = minuteKey;
    user.minuteXP = 0;
  }

  const minuteLimit = config.xp?.minuteLimit ?? 5;
  const dailyLimit = config.xp?.dailyLimit ?? 500;

  // Nếu đã đạt giới hạn thì không cộng
  if (user.minuteXP >= minuteLimit || user.dayXP >= dailyLimit) {
    user.lastMessageText = trimmed;
    user.lastMessageAt = now;
    await user.save();
    return next();
  }

  // XP mỗi tin: >50 ký tự = 2, còn lại = 1
  let gain = trimmed.length > 50 ? 2 : 1;

  // Đảm bảo không vượt quá giới hạn phút/ngày khi cộng
  const possibleMinute = Math.max(0, minuteLimit - user.minuteXP);
  const possibleDay = Math.max(0, dailyLimit - user.dayXP);
  const canGain = Math.min(gain, possibleMinute, possibleDay);

  if (canGain <= 0) {
    user.lastMessageText = trimmed;
    user.lastMessageAt = now;
    await user.save();
    return next();
  }

  // ===== LEVEL UP + THƯỞNG COIN =====

  const oldLevel = calcLevel(user.totalXP); // Level trước khi cộng XP

  // Cộng XP
  user.totalXP += canGain;
  user.dayXP += canGain;
  user.weekXP += canGain;
  user.monthXP += canGain;
  user.minuteXP += canGain;

  const newLevel = calcLevel(user.totalXP); // Level sau khi cộng XP

  // Nếu có lên level
  if (newLevel > oldLevel) {
    const levelUp = newLevel - oldLevel;

    // B) Thưởng coin cho mỗi level tăng
    const coinPerLevel = 50;
    let totalBonus = levelUp * coinPerLevel;
    user.topCoin += totalBonus;

    // A) Thưởng mốc level lớn
    const milestoneRewards = {
      5: 20,
      10: 40,
      20: 60,
      30: 80,
      40: 100,
      50: 150,
      75: 200,
      100: 300
    };

    if (milestoneRewards[newLevel]) {
      const milestoneCoin = milestoneRewards[newLevel];
      user.topCoin += milestoneCoin;
      totalBonus += milestoneCoin;
    }

    try {
      await ctx.reply(
        `🎉 Bạn đã lên Level ${newLevel}!\n` +
        `+${levelUp * coinPerLevel} coin (thưởng lên level)\n` +
        (milestoneRewards[newLevel]
          ? `+${milestoneRewards[newLevel]} coin (mốc Level ${newLevel})\n`
          : '') +
        `Tổng coin thưởng: +${totalBonus} coin`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    } catch (e) {
      console.log('Reply level up error:', e.message);
    }
  }

  // Lưu lại tin nhắn gần nhất
  user.lastMessageText = trimmed;
  user.lastMessageAt = now;

  await user.save();
  return next();
};
