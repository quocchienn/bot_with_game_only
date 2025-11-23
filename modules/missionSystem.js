import Mission from '../models/Mission.js';
import { missionPool } from '../config/missions.js';

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

// random 1 nhiệm vụ trong pool
function pickMission() {
  return missionPool[Math.floor(Math.random() * missionPool.length)];
}

// tạo nhiệm vụ nếu chưa có trong ngày
export async function ensureDailyMission(userId) {
  const today = getDayKey();
  const exist = await Mission.findOne({ userId, dateKey: today });
  if (exist) return exist;

  const m = pickMission();

  const mission = await Mission.create({
    userId,
    dateKey: today,
    type: m.type,
    progress: 0,
    target: m.target,
    rewardXP: m.rewardXP,
    rewardCoin: m.rewardCoin
  });

  return mission;
}

// cập nhật tiến trình
export async function updateMissionProgress(user, ctx) {
  const today = getDayKey();
  const mission = await Mission.findOne({ userId: user._id, dateKey: today });
  if (!mission || mission.completed) return;

  const msg = ctx.message;
  if (!msg) return;

  switch (mission.type) {
    case 'send10':
    case 'send50':
      mission.progress += 1;
      break;
    case 'long3':
      if (msg.text && msg.text.length > 70) mission.progress += 1;
      break;
    case 'reply5':
      if (msg.reply_to_message) mission.progress += 1;
      break;
    case 'img3':
      if (msg.photo) mission.progress += 1;
      break;
    case 'sticker1':
      if (msg.sticker) mission.progress += 1;
      break;
  }

  if (mission.progress >= mission.target) {
    mission.completed = true;

    const gainXP = mission.rewardXP || 0;
    const gainCoin = mission.rewardCoin || 0;

    user.totalXP = (user.totalXP || 0) + gainXP;
    user.dayXP = (user.dayXP || 0) + gainXP;
    user.weekXP = (user.weekXP || 0) + gainXP;
    user.monthXP = (user.monthXP || 0) + gainXP;
    user.topCoin = (user.topCoin || 0) + gainCoin;
    await user.save();

    await ctx.reply(
      `🎉 Hoàn thành nhiệm vụ ngày!\n+${gainXP} XP\n+${gainCoin} coin`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  }

  await mission.save();
}
