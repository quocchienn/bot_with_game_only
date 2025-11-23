import { Telegraf } from 'telegraf';
import commands from '../commands/index.js';
import xpHandler from './xp.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// middleware XP + anti-spam
bot.use(xpHandler);

// commands
commands(bot);

export default bot;
