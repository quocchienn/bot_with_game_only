import cron from 'node-cron';
import User from '../models/User.js';

// Chủ nhật 23:59: cộng coin cho top tuần + reset weekXP
cron.schedule('59 23 * * 0', async () => {
  try {
    const top = await User.find().sort({ weekXP: -1 }).limit(3);
    for (const [index, u] of top.entries()) {
      const bonus = index === 0 ? 50 : index === 1 ? 30 : 20;
      u.topCoin += bonus;
      await u.save();
    }
    await User.updateMany({}, { weekXP: 0 });
    console.log('✅ Weekly snapshot & reset done');
  } catch (err) {
    console.error('Weekly cron error', err);
  }
});
