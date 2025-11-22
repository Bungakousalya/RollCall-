const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student'], required: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  phone: String,
  
  // Profile Completion
  preferencesSetup: { type: Boolean, default: false },
  
  // Student specific fields
  department: String,
  year: Number,
  section: String,
  semester: Number,
  rollNumber: String,
  faceDescriptor: [Number],
  profileImage: String,
  interests: [String],
  weakSubjects: [String],
  goals: String,
  careerTarget: String,
  learningStyle: { 
    type: String, 
    enum: ['visual', 'auditory', 'kinesthetic', 'reading_writing', 'mixed', ''] 
  },
  studyPreferences: {
    morningPerson: { type: Boolean, default: false },
    preferredStudyDuration: { type: Number, default: 45 },
    groupStudy: { type: Boolean, default: false },
    focusAreas: [String]
  },
  
  // Teacher specific fields
  subjectsHandled: [String],
  departmentAssigned: [String],

  // HOD specific fields
  isHod: { type: Boolean, default: false },
  hodOfDepartment: { type: String },

  // Admin specific fields
  institutionName: String,
  institutionCode: String,
  address: String,
  
  // Analytics
  lastActivity: Date,
  lastAnalyticsUpdate: Date,
  
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', UserSchema);