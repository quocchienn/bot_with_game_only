import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  name: { type: String, unique: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

export default mongoose.model('Team', teamSchema);
