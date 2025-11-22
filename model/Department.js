const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  hod: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  years: [{
    year: Number,
    sections: [String]
  }],
  subjects: [{
    name: String,
    code: String,
    semester: Number,
    credits: Number,
    type: { type: String, enum: ['theory', 'lab'], default: 'theory' }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Department', DepartmentSchema);