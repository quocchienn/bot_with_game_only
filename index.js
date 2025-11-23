import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import bot from './utils/bot.js';
import './cron/weekly.js';
import './cron/monthly.js';
import { getTopAnnouncementText } from './cron/announce.js';

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error', err));



const TOP_CHAT_ID = process.env.TOP_CHAT_ID ? Number(process.env.TOP_CHAT_ID) : null;
import cron from 'node-cron';

if (TOP_CHAT_ID) {
  cron.schedule('0 12 * * *', async () => {
    try {
      const text = await getTopAnnouncementText();
      if (text) {
        await bot.telegram.sendMessage(TOP_CHAT_ID, text);
      }
    } catch (e) {
      console.log('Cron 12h error:', e.message);
    }
  });

  cron.schedule('0 20 * * *', async () => {
    try {
      const text = await getTopAnnouncementText();
      if (text) {
        await bot.telegram.sendMessage(TOP_CHAT_ID, text);
      }
    } catch (e) {
      console.log('Cron 20h error:', e.message);
    }
  });
}

const app = express();
app.get('/', (req, res) => res.send('Bot is running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on', PORT));

bot.launch().then(() => console.log('🤖 Bot launched'));
