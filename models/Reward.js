import mongoose from 'mongoose';

const rewardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, // capcut, canva_edu, canva_pro, nothing, etc.
  status: { type: String, default: 'pending' }, // pending | claimed | rejected
  detail: String
}, {
  timestamps: true
});

export default mongoose.model('Reward', rewardSchema);
