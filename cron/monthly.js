import cron from 'node-cron';
import User from '../models/User.js';

// Ngày 1 hàng tháng 00:05: cộng coin cho top tháng + reset monthXP
cron.schedule('5 0 1 * *', async () => {
  try {
    const top = await User.find().sort({ monthXP: -1 }).limit(3);
    for (const [index, u] of top.entries()) {
      const bonus = index === 0 ? 100 : index === 1 ? 70 : 50;
      u.topCoin += bonus;
      await u.save();
    }
    await User.updateMany({}, { monthXP: 0 });
    console.log('✅ Monthly snapshot & reset done');
  } catch (err) {
    console.error('Monthly cron error', err);
  }
});
