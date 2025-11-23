import cron from 'node-cron';
import User from '../models/User.js';

const TOP_CHAT_ID = process.env.TOP_CHAT_ID ? Number(process.env.TOP_CHAT_ID) : null;

async function buildTopText() {
  const week = await User.find().sort({ weekXP: -1 }).limit(10);
  const month = await User.find().sort({ monthXP: -1 }).limit(10);

  let text = '🏆 BẢNG XẾP HẠNG TẠM THỜI\n\n';

  if (week.length) {
    text += '📅 TOP TUẦN:\n';
    week.forEach((u, i) => {
      const name = u.username ? '@' + u.username : 'ID ' + u.telegramId;
      text += `${i + 1}. ${name} – ${u.weekXP} XP tuần\n`;
    });
    text += '\n';
  }

  if (month.length) {
    text += '📆 TOP THÁNG:\n';
    month.forEach((u, i) => {
      const name = u.username ? '@' + u.username : 'ID ' + u.telegramId;
      text += `${i + 1}. ${name} – ${u.monthXP} XP tháng\n`;
    });
    text += '\n';
  }

  return text;
}

// file này chỉ build text, còn gửi sẽ được gọi từ index qua bot nếu cần
export async function getTopAnnouncementText() {
  return await buildTopText();
}
