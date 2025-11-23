import mongoose from 'mongoose';

const missionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  dateKey: { type: String, index: true }, // YYYY-MM-DD

  // nhiệm vụ random trong ngày
  type: String, // send10, send50, long3, reply5, img3, sticker1
  progress: { type: Number, default: 0 },
  target: { type: Number, default: 0 },

  rewardXP: { type: Number, default: 0 },
  rewardCoin: { type: Number, default: 0 },

  completed: { type: Boolean, default: false }
}, {
  timestamps: true
});

export default mongoose.model('Mission', missionSchema);
