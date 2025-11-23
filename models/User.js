import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // Thông tin cơ bản
  telegramId: { type: Number, index: true },
  username: { type: String, default: '' },

  // Vai trò (dùng cho admin pack)
  role: { type: String, default: 'user' }, // 'admin' | 'user'

  // Team / Clan
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  // XP & level
  totalXP: { type: Number, default: 0 },   // tổng XP dùng tính level
  dayXP:   { type: Number, default: 0 },   // XP trong ngày
  weekXP:  { type: Number, default: 0 },   // XP trong tuần
  monthXP: { type: Number, default: 0 },   // XP trong tháng

  // Giới hạn XP theo phút/ngày
  minuteXP: { type: Number, default: 0 },  // XP trong phút hiện tại
  dayKey:   { type: String, default: null },    // 'YYYY-MM-DD' ngày hiện tại
  minuteKey:{ type: String, default: null },    // 'YYYY-MM-DDTHH:MM' phút hiện tại

  // Đếm tin nhắn
  messageCount: { type: Number, default: 0 },   // tổng số tin nhắn đã gửi

  // Coin (dùng cho shop / send / duel / roll / event)
  topCoin: { type: Number, default: 0 },

  // Cảnh cáo / ban
  banned: { type: Boolean, default: false },
  warningCount: { type: Number, default: 0 },
  warnings: [
    {
      reason: { type: String, default: '' },
      at: { type: Date, default: Date.now }
    }
  ],

  // Anti-spam
  lastMessageText: { type: String, default: '' },
  lastMessageAt:   { type: Date, default: null },

  spamWindowStart: { type: Date, default: null },
  spamCount:       { type: Number, default: 0 },

  // Daily / nhiệm vụ ngày (/daily, /claimdaily)
  lastDailyAt:        { type: String, default: null }, // ngày đã điểm danh: 'YYYY-MM-DD'
  lastDailyQuestKey:  { type: String, default: null }, // ngày đã nhận thưởng nhiệm vụ chat
  dailyStreak:        { type: Number, default: 0 },    // số ngày điểm danh liên tiếp

  // Giới hạn XP từ QUZ mỗi ngày
  // /quiz nâng cao đang dùng field này để chặn 200 XP/ngày
  quizXp: {
    date: { type: String, default: null }, // 'YYYY-MM-DD'
    xp:   { type: Number, default: 0 }     // tổng XP đã nhận từ quiz trong ngày đó
  }
}, {
  timestamps: true
});

export default mongoose.model('User', userSchema);
