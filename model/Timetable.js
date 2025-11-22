const mongoose = require('mongoose');

const TimetableSchema = new mongoose.Schema({
  department: { type: String, required: true },
  year: { type: Number, required: true },
  section: { type: String, required: true },
  semester: { type: Number, required: true },
  schedule: [{
    day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], required: true },
    slots: [{
      startTime: String,
      endTime: String,
      subject: String,
      subjectCode: String,
      teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      type: { type: String, enum: ['theory', 'lab'], default: 'theory' },
      room: String
    }]
  }],
  academicYear: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Timetable', TimetableSchema);