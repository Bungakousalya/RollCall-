const mongoose = require('mongoose');

const StudentTaskSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  freePeriods: [{
    startTime: String,
    endTime: String,
    duration: Number
  }],
  suggestedTasks: [{
    title: String,
    description: String,
    type: { type: String, enum: ['study', 'practice', 'assignment', 'video'], required: true },
    subject: String,
    estimatedTime: Number,
    priority: { type: Number, min: 1, max: 5 },
    resources: [String],
    completed: { type: Boolean, default: false },
    completedAt: Date
  }],
  lastAnalyticsUpdate: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudentTask', StudentTaskSchema);