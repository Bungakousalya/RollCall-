const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  department: { type: String, required: true },
  year: { type: Number, required: true },
  section: { type: String, required: true },
  subject: { type: String, required: true },
  subjectCode: String,
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slot: {
    startTime: String,
    endTime: String
  },
  classPhoto: String,
  students: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['present', 'absent'], required: true },
    confidence: Number,
    manuallyMarked: { type: Boolean, default: false }
  }],
  totalStudents: Number,
  presentCount: Number,
  absentCount: Number,
  attendancePercentage: Number,
  isConfirmed: { type: Boolean, default: false },
  correctionRequests: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedStatus: String,
    reason: String,
    requestDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminComment: String
  }],
  analyticsUpdated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Attendance', AttendanceSchema);