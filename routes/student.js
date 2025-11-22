// const express = require('express');
// const User = require('../model/User');
// const Timetable = require('../model/Timetable');
// const Attendance = require('../model/Attendance');
// const StudentTask = require('../model/StudentTask');
// const { auth } = require('../middleware/auth');

// const router = express.Router();

// router.get('/dashboard', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = req.user;
//     const today = new Date();
//     const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    
//     const timetable = await Timetable.findOne({
//       department: student.department,
//       year: student.year,
//       section: student.section
//     }).populate('schedule.slots.teacher', 'name');

//     let todaySchedule = [];
//     if (timetable) {
//       const daySchedule = timetable.schedule.find(s => s.day === dayName);
//       if (daySchedule) {
//         todaySchedule = daySchedule.slots;
//       }
//     }

//     const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const today_end = new Date(today_start);
//     today_end.setDate(today_end.getDate() + 1);

//     const todayAttendance = await Attendance.find({
//       date: { $gte: today_start, $lt: today_end },
//       department: student.department,
//       year: student.year,
//       section: student.section,
//       'students.student': student._id
//     });

//     const classesWithAttendance = todaySchedule.map(slot => {
//       const attendance = todayAttendance.find(att => 
//         att.subject === slot.subject && 
//         att.slot.startTime === slot.startTime
//       );
      
//       let status = 'upcoming';
//       if (attendance) {
//         const studentRecord = attendance.students.find(s => s.student.equals(student._id));
//         status = studentRecord ? studentRecord.status : 'not_marked';
//       }

//       return {
//         ...slot.toObject(),
//         attendanceStatus: status
//       };
//     });

//     const totalAttendance = await Attendance.aggregate([
//       {
//         $match: {
//           department: student.department,
//           year: student.year,
//           section: student.section,
//           'students.student': student._id
//         }
//       },
//       {
//         $unwind: '$students'
//       },
//       {
//         $match: {
//           'students.student': student._id
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           totalClasses: { $sum: 1 },
//           presentClasses: {
//             $sum: {
//               $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0]
//             }
//           }
//         }
//       }
//     ]);

//     const attendanceStats = totalAttendance[0] || { totalClasses: 0, presentClasses: 0 };
//     const attendancePercentage = attendanceStats.totalClasses > 0 
//       ? Math.round((attendanceStats.presentClasses / attendanceStats.totalClasses) * 100)
//       : 0;

//     res.json({
//       student: {
//         name: student.name,
//         rollNumber: student.rollNumber,
//         department: student.department,
//         year: student.year,
//         section: student.section
//       },
//       todaySchedule: classesWithAttendance,
//       attendanceStats: {
//         percentage: attendancePercentage,
//         present: attendanceStats.presentClasses,
//         total: attendanceStats.totalClasses
//       }
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.get('/attendance-history', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const { subject, startDate, endDate } = req.query;
//     const student = req.user;

//     let matchQuery = {
//       department: student.department,
//       year: student.year,
//       section: student.section,
//       'students.student': student._id
//     };

//     if (subject) {
//       matchQuery.subject = subject;
//     }

//     if (startDate && endDate) {
//       matchQuery.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }

//     const attendanceHistory = await Attendance.find(matchQuery)
//       .populate('teacher', 'name')
//       .sort({ date: -1 });

//     const formattedHistory = attendanceHistory.map(record => {
//       const studentRecord = record.students.find(s => s.student.equals(student._id));
//       return {
//         date: record.date,
//         subject: record.subject,
//         teacher: record.teacher.name,
//         status: studentRecord ? studentRecord.status : 'not_marked',
//         slot: record.slot
//       };
//     });

//     res.json(formattedHistory);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.post('/correction-request', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const { attendanceId, requestedStatus, reason } = req.body;
    
//     const attendance = await Attendance.findById(attendanceId);
//     if (!attendance) {
//       return res.status(404).json({ message: 'Attendance record not found' });
//     }

//     const studentExists = attendance.students.some(s => s.student.equals(req.user._id));
//     if (!studentExists) {
//       return res.status(403).json({ message: 'You are not part of this class' });
//     }

//     const existingRequest = attendance.correctionRequests.find(r => 
//       r.student.equals(req.user._id) && r.status === 'pending'
//     );

//     if (existingRequest) {
//       return res.status(400).json({ message: 'Correction request already pending' });
//     }

//     attendance.correctionRequests.push({
//       student: req.user._id,
//       requestedStatus,
//       reason
//     });

//     await attendance.save();
//     res.json({ message: 'Correction request submitted successfully' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.get('/free-period-suggestions', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = req.user;
//     const today = new Date();
//     const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    
//     const timetable = await Timetable.findOne({
//       department: student.department,
//       year: student.year,
//       section: student.section
//     });

//     if (!timetable) {
//       return res.json({ freePeriods: [], suggestedTasks: [] });
//     }

//     const daySchedule = timetable.schedule.find(s => s.day === dayName);
//     if (!daySchedule) {
//       return res.json({ freePeriods: [], suggestedTasks: [] });
//     }

//     const slots = daySchedule.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
//     const freePeriods = [];
    
//     for (let i = 0; i < slots.length - 1; i++) {
//       const currentEnd = slots[i].endTime;
//       const nextStart = slots[i + 1].startTime;
      
//       const endTime = new Date(`1970-01-01T${currentEnd}:00`);
//       const startTime = new Date(`1970-01-01T${nextStart}:00`);
      
//       const gap = (startTime - endTime) / (1000 * 60);
      
//       if (gap > 15) {
//         freePeriods.push({
//           startTime: currentEnd,
//           endTime: nextStart,
//           duration: gap
//         });
//       }
//     }

//     const suggestedTasks = [];
    
//     freePeriods.forEach(period => {
//       if (student.weakSubjects && student.weakSubjects.length > 0) {
//         student.weakSubjects.forEach(subject => {
//           if (period.duration >= 30) {
//             suggestedTasks.push({
//               title: `Practice ${subject} concepts`,
//               description: `Review and practice problems in ${subject}`,
//               type: 'practice',
//               subject: subject,
//               estimatedTime: Math.min(period.duration, 45),
//               priority: 5,
//               resources: [`/resources/${subject.toLowerCase()}-practice`]
//             });
//           }
//         });
//       }

//       if (student.interests && student.interests.length > 0) {
//         student.interests.forEach(interest => {
//           if (period.duration >= 20) {
//             suggestedTasks.push({
//               title: `Explore ${interest}`,
//               description: `Learn more about ${interest}`,
//               type: 'study',
//               subject: interest,
//               estimatedTime: Math.min(period.duration, 30),
//               priority: 3,
//               resources: [`/resources/${interest.toLowerCase()}-tutorials`]
//             });
//           }
//         });
//       }

//       if (period.duration >= 45) {
//         suggestedTasks.push({
//           title: 'Complete pending assignments',
//           description: 'Work on any pending coursework',
//           type: 'assignment',
//           estimatedTime: 45,
//           priority: 4,
//           resources: []
//         });
//       }

//       if (period.duration >= 25) {
//         suggestedTasks.push({
//           title: 'Watch educational video',
//           description: 'Learn something new from online tutorials',
//           type: 'video',
//           estimatedTime: 25,
//           priority: 2,
//           resources: ['https://youtube.com/education']
//         });
//       }
//     });

//     let studentTask = await StudentTask.findOne({
//       student: student._id,
//       date: {
//         $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
//         $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
//       }
//     });

//     if (!studentTask) {
//       studentTask = new StudentTask({
//         student: student._id,
//         date: today,
//         freePeriods,
//         suggestedTasks
//       });
//       await studentTask.save();
//     }

//     res.json({ freePeriods, suggestedTasks });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.put('/profile', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const { interests, weakSubjects, goals, careerTarget } = req.body;
    
//     const updatedStudent = await User.findByIdAndUpdate(
//       req.user._id,
//       { interests, weakSubjects, goals, careerTarget },
//       { new: true, runValidators: true }
//     );

//     res.json({
//       message: 'Profile updated successfully',
//       student: {
//         interests: updatedStudent.interests,
//         weakSubjects: updatedStudent.weakSubjects,
//         goals: updatedStudent.goals,
//         careerTarget: updatedStudent.careerTarget
//       }
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.put('/tasks/:taskId/complete', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const today = new Date();
//     const studentTask = await StudentTask.findOne({
//       student: req.user._id,
//       date: {
//         $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
//         $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
//       }
//     });

//     if (!studentTask) {
//       return res.status(404).json({ message: 'Task record not found' });
//     }

//     const task = studentTask.suggestedTasks.id(req.params.taskId);
//     if (!task) {
//       return res.status(404).json({ message: 'Task not found' });
//     }

//     task.completed = true;
//     task.completedAt = new Date();
    
//     await studentTask.save();
//     res.json({ message: 'Task marked as completed' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;












// routes/student.js (COMPLETE CORRECTED VERSION)
// const express = require('express');
// const User = require('../model/User');
// const Timetable = require('../model/Timetable');
// const Attendance = require('../model/Attendance');
// const StudentTask = require('../model/StudentTask');
// const { auth } = require('../middleware/auth');

// const router = express.Router();

// // Helper function to get low attendance subjects
// const getLowAttendanceSubjects = async (studentId) => {
//   try {
//     const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
//     const subjectAttendance = await Attendance.aggregate([
//       {
//         $match: {
//           'students.student': studentId,
//           date: { $gte: thirtyDaysAgo }
//         }
//       },
//       { $unwind: '$students' },
//       {
//         $match: {
//           'students.student': studentId
//         }
//       },
//       {
//         $group: {
//           _id: '$subject',
//           totalClasses: { $sum: 1 },
//           presentCount: {
//             $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
//           }
//         }
//       },
//       {
//         $project: {
//           subject: '$_id',
//           totalClasses: 1,
//           presentCount: 1,
//           attendancePercentage: {
//             $multiply: [{ $divide: ['$presentCount', '$totalClasses'] }, 100]
//           }
//         }
//       },
//       { 
//         $match: { 
//           attendancePercentage: { $lt: 80 } 
//         } 
//       },
//       { $sort: { attendancePercentage: 1 } }
//     ]);

//     return subjectAttendance;
//   } catch (error) {
//     console.error('Error getting low attendance subjects:', error);
//     return [];
//   }
// };

// // Student Dashboard
// router.get('/dashboard', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = req.user;
//     const today = new Date();
//     const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    
//     const timetable = await Timetable.findOne({
//       department: student.department,
//       year: student.year,
//       section: student.section
//     }).populate('schedule.slots.teacher', 'name');

//     let todaySchedule = [];
//     if (timetable) {
//       const daySchedule = timetable.schedule.find(s => s.day === dayName);
//       if (daySchedule) {
//         todaySchedule = daySchedule.slots;
//       }
//     }

//     const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const today_end = new Date(today_start);
//     today_end.setDate(today_end.getDate() + 1);

//     const todayAttendance = await Attendance.find({
//       date: { $gte: today_start, $lt: today_end },
//       department: student.department,
//       year: student.year,
//       section: student.section,
//       'students.student': student._id
//     });

//     const classesWithAttendance = todaySchedule.map(slot => {
//       const attendance = todayAttendance.find(att => 
//         att.subject === slot.subject && 
//         att.slot.startTime === slot.startTime
//       );
      
//       let status = 'upcoming';
//       if (attendance) {
//         const studentRecord = attendance.students.find(s => s.student.equals(student._id));
//         status = studentRecord ? studentRecord.status : 'not_marked';
//       }

//       return {
//         ...slot.toObject(),
//         attendanceStatus: status
//       };
//     });

//     // Overall attendance stats (last 30 days)
//     const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
//     const totalAttendance = await Attendance.aggregate([
//       {
//         $match: {
//           department: student.department,
//           year: student.year,
//           section: student.section,
//           'students.student': student._id,
//           date: { $gte: thirtyDaysAgo }
//         }
//       },
//       {
//         $unwind: '$students'
//       },
//       {
//         $match: {
//           'students.student': student._id
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           totalClasses: { $sum: 1 },
//           presentClasses: {
//             $sum: {
//               $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0]
//             }
//           }
//         }
//       }
//     ]);

//     const attendanceStats = totalAttendance[0] || { totalClasses: 0, presentClasses: 0 };
//     const attendancePercentage = attendanceStats.totalClasses > 0 
//       ? Math.round((attendanceStats.presentClasses / attendanceStats.totalClasses) * 100)
//       : 0;

//     // Get low attendance subjects using helper function
//     const lowAttendanceSubjects = await getLowAttendanceSubjects(student._id);

//     // Check today's task completion
//     const todayTask = await StudentTask.findOne({
//       student: student._id,
//       date: { $gte: today_start, $lt: today_end }
//     });

//     const taskCompletion = todayTask ? {
//       completed: todayTask.suggestedTasks.filter(t => t.completed).length,
//       total: todayTask.suggestedTasks.length
//     } : { completed: 0, total: 0 };

//     res.json({
//       student: {
//         name: student.name,
//         rollNumber: student.rollNumber,
//         department: student.department,
//         year: student.year,
//         section: student.section,
//         goals: student.goals,
//         careerTarget: student.careerTarget
//       },
//       todaySchedule: classesWithAttendance,
//       attendanceStats: {
//         percentage: attendancePercentage,
//         present: attendanceStats.presentClasses,
//         total: attendanceStats.totalClasses,
//         status: attendancePercentage < 75 ? 'critical' : 
//                 attendancePercentage < 80 ? 'warning' : 'good'
//       },
//       lowAttendanceSubjects: lowAttendanceSubjects.map(s => ({
//         subject: s.subject,
//         percentage: Math.round(s.attendancePercentage),
//         missedClasses: s.totalClasses - s.presentCount
//       })),
//       todayProgress: {
//         tasksCompleted: taskCompletion.completed,
//         totalTasks: taskCompletion.total,
//         percentage: taskCompletion.total > 0 ? 
//           Math.round((taskCompletion.completed / taskCompletion.total) * 100) : 0
//       }
//     });
//   } catch (error) {
//     console.error('Student dashboard error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Free Period Suggestions
// // Enhanced Free Period Suggestions with profile validation
// router.get('/free-period-suggestions', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = await User.findById(req.user._id);
    
//     // Check if profile is properly set up for personalized suggestions
//     if (!student.preferencesSetup) {
//       return res.status(400).json({
//         message: 'Please complete your profile setup to get personalized suggestions',
//         code: 'PROFILE_INCOMPLETE',
//         requiredFields: ['interests', 'weakSubjects', 'goals'],
//         nextStep: 'Update your profile at /api/student/profile'
//       });
//     }

//     const today = new Date();
//     const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
//     const todayDateString = today.toISOString().split('T')[0];

//     // Get timetable from database (uploaded via admin route)
//     const timetable = await Timetable.findOne({
//       department: student.department,
//       year: student.year,
//       section: student.section
//     });

//     if (!timetable) {
//       return res.json({ 
//         message: 'No timetable found for your class',
//         freePeriods: [], 
//         suggestedTasks: [] 
//       });
//     }

//     // Find today's schedule
//     const daySchedule = timetable.schedule.find(s => 
//       s.day.toLowerCase() === dayName.toLowerCase()
//     );

//     if (!daySchedule) {
//       return res.json({ 
//         message: 'No classes scheduled today',
//         freePeriods: [], 
//         suggestedTasks: [] 
//       });
//     }

//     // Sort slots by time and calculate free periods
//     const slots = daySchedule.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
//     const freePeriods = [];
    
//     // Check gaps between consecutive classes
//     for (let i = 0; i < slots.length - 1; i++) {
//       const currentEnd = slots[i].endTime;
//       const nextStart = slots[i + 1].startTime;
      
//       // Use current date for accurate time calculation
//       const endTime = new Date(`${todayDateString}T${currentEnd}`);
//       const startTime = new Date(`${todayDateString}T${nextStart}`);
      
//       const gap = (startTime - endTime) / (1000 * 60); // gap in minutes
      
//       if (gap > 15) { // Only consider gaps longer than 15 minutes
//         freePeriods.push({
//           startTime: currentEnd,
//           endTime: nextStart,
//           duration: gap,
//           actualStartDateTime: endTime,
//           actualEndDateTime: startTime
//         });
//       }
//     }

//     // Filter out free periods that have already passed
//     const currentTime = today;
//     const upcomingFreePeriods = freePeriods.filter(period => 
//       period.actualEndDateTime > currentTime
//     );

//     if (upcomingFreePeriods.length === 0) {
//       return res.json({ 
//         message: 'No upcoming free periods today',
//         freePeriods: [], 
//         suggestedTasks: [] 
//       });
//     }

//     // Generate personalized task suggestions
//     const allSuggestedTasks = [];
    
//     upcomingFreePeriods.forEach(period => {
//       const periodTasks = [];

//       // Check if this period is happening right now
//       const isCurrentPeriod = currentTime >= period.actualStartDateTime && 
//                              currentTime <= period.actualEndDateTime;

//       // High priority tasks for weak subjects
//       if (student.weakSubjects && student.weakSubjects.length > 0) {
//         student.weakSubjects.forEach(subject => {
//           if (period.duration >= 30) {
//             periodTasks.push({
//               title: `Practice ${subject} concepts`,
//               description: `Review and practice problems in ${subject}`,
//               type: 'practice',
//               subject: subject,
//               estimatedTime: Math.min(period.duration, 45),
//               priority: isCurrentPeriod ? 9 : 8,
//               resources: [`/resources/${subject.toLowerCase().replace(/\s+/g, '-')}-practice`],
//               periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
//             });
//           }
//         });
//       }

//       // Assignment completion tasks
//       if (period.duration >= 45) {
//         periodTasks.push({
//           title: 'Complete pending assignments',
//           description: 'Work on any pending coursework',
//           type: 'assignment',
//           estimatedTime: 45,
//           priority: isCurrentPeriod ? 8 : 7,
//           resources: [],
//           periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
//         });
//       }

//       // Interest-based learning
//       if (student.interests && student.interests.length > 0) {
//         student.interests.forEach(interest => {
//           if (period.duration >= 20) {
//             periodTasks.push({
//               title: `Explore ${interest}`,
//               description: `Learn more about ${interest}`,
//               type: 'study',
//               subject: interest,
//               estimatedTime: Math.min(period.duration, 30),
//               priority: 5,
//               resources: [`/resources/${interest.toLowerCase().replace(/\s+/g, '-')}-tutorials`],
//               periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
//             });
//           }
//         });
//       }

//       // Educational content consumption
//       if (period.duration >= 25) {
//         periodTasks.push({
//           title: 'Watch educational video',
//           description: 'Learn something new from online tutorials',
//           type: 'video',
//           estimatedTime: 25,
//           priority: 3,
//           resources: ['https://youtube.com/education'],
//           periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
//         });
//       }

//       // Quick review tasks for short periods
//       if (period.duration >= 15 && period.duration < 20) {
//         periodTasks.push({
//           title: 'Quick concept review',
//           description: 'Brief review of recent topics',
//           type: 'review',
//           estimatedTime: 15,
//           priority: 4,
//           resources: [],
//           periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
//         });
//       }

//       // Sort tasks by priority and add to results
//       const sortedTasks = periodTasks.sort((a, b) => b.priority - a.priority);
//       allSuggestedTasks.push({
//         freePeriod: period,
//         tasks: sortedTasks.slice(0, 5), // Top 5 tasks for this period
//         periodStatus: isCurrentPeriod ? 'current' : 'upcoming',
//         timeUntilStart: isCurrentPeriod ? 0 : Math.max(0, (period.actualStartDateTime - currentTime) / (1000 * 60))
//       });
//     });

//     // Save to database for tracking
//     const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const today_end = new Date(today_start);
//     today_end.setDate(today_end.getDate() + 1);

//     let studentTask = await StudentTask.findOne({
//       student: student._id,
//       date: { $gte: today_start, $lt: today_end }
//     });

//     const flattenedTasks = allSuggestedTasks.flatMap(item => item.tasks);

//     if (!studentTask) {
//       studentTask = new StudentTask({
//         student: student._id,
//         date: today,
//         freePeriods: upcomingFreePeriods,
//         suggestedTasks: flattenedTasks
//       });
//       await studentTask.save();
//     } else {
//       studentTask.freePeriods = upcomingFreePeriods;
//       studentTask.suggestedTasks = flattenedTasks;
//       await studentTask.save();
//     }

//     // Enhanced response with current time context and personalization info
//     res.json({
//       currentTime: today.toISOString(),
//       today: dayName,
//       freePeriods: allSuggestedTasks,
//       personalized: true,
//       basedOn: {
//         weakSubjects: student.weakSubjects,
//         interests: student.interests,
//         goals: student.goals,
//         careerTarget: student.careerTarget
//       },
//       summary: {
//         totalFreePeriods: upcomingFreePeriods.length,
//         totalFreeTime: upcomingFreePeriods.reduce((sum, fp) => sum + fp.duration, 0),
//         currentPeriods: allSuggestedTasks.filter(fp => fp.periodStatus === 'current').length,
//         upcomingPeriods: allSuggestedTasks.filter(fp => fp.periodStatus === 'upcoming').length,
//         priorityTasks: flattenedTasks.filter(t => t.priority >= 7)
//       }
//     });
//   } catch (error) {
//     console.error('Free period suggestions error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Attendance History
// router.get('/attendance-history', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const { subject, startDate, endDate } = req.query;
//     const student = req.user;

//     let matchQuery = {
//       department: student.department,
//       year: student.year,
//       section: student.section,
//       'students.student': student._id
//     };

//     if (subject) {
//       matchQuery.subject = subject;
//     }

//     if (startDate && endDate) {
//       matchQuery.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }

//     const attendanceHistory = await Attendance.find(matchQuery)
//       .populate('teacher', 'name')
//       .sort({ date: -1 });

//     const formattedHistory = attendanceHistory.map(record => {
//       const studentRecord = record.students.find(s => s.student.equals(student._id));
//       return {
//         date: record.date,
//         subject: record.subject,
//         teacher: record.teacher.name,
//         status: studentRecord ? studentRecord.status : 'not_marked',
//         slot: record.slot
//       };
//     });

//     res.json(formattedHistory);
//   } catch (error) {
//     console.error('Attendance history error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Correction Request
// router.post('/correction-request', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const { attendanceId, requestedStatus, reason } = req.body;
    
//     const attendance = await Attendance.findById(attendanceId);
//     if (!attendance) {
//       return res.status(404).json({ message: 'Attendance record not found' });
//     }

//     const studentExists = attendance.students.some(s => s.student.equals(req.user._id));
//     if (!studentExists) {
//       return res.status(403).json({ message: 'You are not part of this class' });
//     }

//     const existingRequest = attendance.correctionRequests.find(r => 
//       r.student.equals(req.user._id) && r.status === 'pending'
//     );

//     if (existingRequest) {
//       return res.status(400).json({ message: 'Correction request already pending' });
//     }

//     attendance.correctionRequests.push({
//       student: req.user._id,
//       requestedStatus,
//       reason
//     });

//     await attendance.save();
//     res.json({ message: 'Correction request submitted successfully' });
//   } catch (error) {
//     console.error('Correction request error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // routes/student.js (CORRECTED - Single Profile System)

// // ... other imports and routes ...

// // COMPLETE PROFILE MANAGEMENT SYSTEM
// router.get('/profile', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = await User.findById(req.user._id).select('-password');
    
//     res.json({
//       profile: {
//         basicInfo: {
//           name: student.name,
//           rollNumber: student.rollNumber,
//           department: student.department,
//           year: student.year,
//           section: student.section,
//           email: student.email,
//           phone: student.phone
//         },
//         academicPreferences: {
//           interests: student.interests || [],
//           weakSubjects: student.weakSubjects || [],
//           goals: student.goals || '',
//           careerTarget: student.careerTarget || '',
//           learningStyle: student.learningStyle || '',
//           studyPreferences: student.studyPreferences || {}
//         },
//         preferencesSetup: student.preferencesSetup || false
//       }
//     });
//   } catch (error) {
//     console.error('Get profile error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // UPDATE PROFILE (Complete - replaces both /profile and /setup-preferences)
// router.put('/profile', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const {
//       // Basic info (optional updates)
//       phone,
      
//       // Academic preferences
//       interests,
//       weakSubjects,
//       goals,
//       careerTarget,
//       learningStyle,
//       studyPreferences
//     } = req.body;

//     // Validate required academic preferences (only for first-time setup)
//     const student = await User.findById(req.user._id);
//     const isFirstTimeSetup = !student.preferencesSetup;

//     if (isFirstTimeSetup && (!interests || !weakSubjects || !goals)) {
//       return res.status(400).json({ 
//         message: 'For first-time setup, interests, weak subjects, and goals are required' 
//       });
//     }

//     const updateData = {};
    
//     // Update basic info if provided
//     if (phone) updateData.phone = phone;
    
//     // Update academic preferences if provided
//     if (interests) updateData.interests = interests;
//     if (weakSubjects) updateData.weakSubjects = weakSubjects;
//     if (goals) updateData.goals = goals;
//     if (careerTarget) updateData.careerTarget = careerTarget;
//     if (learningStyle) updateData.learningStyle = learningStyle;
//     if (studyPreferences) updateData.studyPreferences = studyPreferences;
    
//     // Mark as setup if this is first time
//     if (isFirstTimeSetup) {
//       updateData.preferencesSetup = true;
//     }

//     const updatedStudent = await User.findByIdAndUpdate(
//       req.user._id,
//       updateData,
//       { new: true, runValidators: true }
//     ).select('-password');

//     res.json({
//       message: isFirstTimeSetup ? 'Profile setup completed successfully!' : 'Profile updated successfully',
//       profile: {
//         basicInfo: {
//           name: updatedStudent.name,
//           rollNumber: updatedStudent.rollNumber,
//           department: updatedStudent.department,
//           year: updatedStudent.year,
//           section: updatedStudent.section,
//           email: updatedStudent.email,
//           phone: updatedStudent.phone
//         },
//         academicPreferences: {
//           interests: updatedStudent.interests,
//           weakSubjects: updatedStudent.weakSubjects,
//           goals: updatedStudent.goals,
//           careerTarget: updatedStudent.careerTarget,
//           learningStyle: updatedStudent.learningStyle,
//           studyPreferences: updatedStudent.studyPreferences
//         },
//         preferencesSetup: updatedStudent.preferencesSetup
//       }
//     });
//   } catch (error) {
//     console.error('Profile update error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Check profile completion status
// router.get('/profile/status', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = await User.findById(req.user._id);
    
//     const completionStatus = {
//       basicInfo: {
//         completed: !!(student.name && student.rollNumber && student.department),
//         missing: []
//       },
//       academicPreferences: {
//         completed: student.preferencesSetup || false,
//         hasInterests: student.interests && student.interests.length > 0,
//         hasWeakSubjects: student.weakSubjects && student.weakSubjects.length > 0,
//         hasGoals: !!student.goals,
//         hasCareerTarget: !!student.careerTarget
//       }
//     };

//     // Check what basic info is missing
//     if (!student.name) completionStatus.basicInfo.missing.push('name');
//     if (!student.rollNumber) completionStatus.basicInfo.missing.push('rollNumber');
//     if (!student.department) completionStatus.basicInfo.missing.push('department');

//     res.json(completionStatus);
//   } catch (error) {
//     console.error('Profile status error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Mark Task as Complete
// router.put('/tasks/:taskId/complete', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const today = new Date();
//     const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const today_end = new Date(today_start);
//     today_end.setDate(today_end.getDate() + 1);

//     const studentTask = await StudentTask.findOne({
//       student: req.user._id,
//       date: { $gte: today_start, $lt: today_end }
//     });

//     if (!studentTask) {
//       return res.status(404).json({ message: 'Task record not found' });
//     }

//     const task = studentTask.suggestedTasks.id(req.params.taskId);
//     if (!task) {
//       return res.status(404).json({ message: 'Task not found' });
//     }

//     task.completed = true;
//     task.completedAt = new Date();
    
//     await studentTask.save();
//     res.json({ message: 'Task marked as completed' });
//   } catch (error) {
//     console.error('Task completion error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Get Subject-wise Attendance Breakdown
// router.get('/attendance-by-subject', auth, async (req, res) => {
//   try {
//     if (req.user.role !== 'student') {
//       return res.status(403).json({ message: 'Student access required' });
//     }

//     const student = req.user;
//     const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

//     const subjectAttendance = await Attendance.aggregate([
//       {
//         $match: {
//           'students.student': student._id,
//           date: { $gte: thirtyDaysAgo }
//         }
//       },
//       { $unwind: '$students' },
//       {
//         $match: {
//           'students.student': student._id
//         }
//       },
//       {
//         $group: {
//           _id: '$subject',
//           totalClasses: { $sum: 1 },
//           presentCount: {
//             $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
//           }
//         }
//       },
//       {
//         $project: {
//           subject: '$_id',
//           totalClasses: 1,
//           presentCount: 1,
//           attendancePercentage: {
//             $multiply: [{ $divide: ['$presentCount', '$totalClasses'] }, 100]
//           }
//         }
//       },
//       { $sort: { attendancePercentage: 1 } }
//     ]);

//     res.json({
//       subjects: subjectAttendance.map(s => ({
//         subject: s.subject,
//         percentage: Math.round(s.attendancePercentage),
//         present: s.presentCount,
//         total: s.totalClasses,
//         status: s.attendancePercentage < 75 ? 'critical' : 
//                 s.attendancePercentage < 80 ? 'warning' : 'good'
//       }))
//     });

//   } catch (error) {
//     console.error('Attendance by subject error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;





const express = require('express');
const User = require('../model/User');
const Timetable = require('../model/Timetable');
const Attendance = require('../model/Attendance');
const StudentTask = require('../model/StudentTask');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Helper function to get low attendance subjects
const getLowAttendanceSubjects = async (studentId) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const subjectAttendance = await Attendance.aggregate([
      {
        $match: {
          'students.student': studentId,
          date: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: '$students' },
      {
        $match: {
          'students.student': studentId
        }
      },
      {
        $group: {
          _id: '$subject',
          totalClasses: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          subject: '$_id',
          totalClasses: 1,
          presentCount: 1,
          attendancePercentage: {
            $multiply: [{ $divide: ['$presentCount', '$totalClasses'] }, 100]
          }
        }
      },
      { 
        $match: { 
          attendancePercentage: { $lt: 80 } 
        } 
      },
      { $sort: { attendancePercentage: 1 } }
    ]);

    return subjectAttendance;
  } catch (error) {
    console.error('Error getting low attendance subjects:', error);
    return [];
  }
};

// Student Dashboard with Real-time Updates
router.get('/dashboard', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const student = req.user;
    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    
    const timetable = await Timetable.findOne({
      department: student.department,
      year: student.year,
      section: student.section
    }).populate('schedule.slots.teacher', 'name');

    let todaySchedule = [];
    if (timetable) {
      const daySchedule = timetable.schedule.find(s => s.day === dayName);
      if (daySchedule) {
        todaySchedule = daySchedule.slots;
      }
    }

    const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const today_end = new Date(today_start);
    today_end.setDate(today_end.getDate() + 1);

    const todayAttendance = await Attendance.find({
      date: { $gte: today_start, $lt: today_end },
      department: student.department,
      year: student.year,
      section: student.section,
      'students.student': student._id
    });

    const classesWithAttendance = todaySchedule.map(slot => {
      const attendance = todayAttendance.find(att => 
        att.subject === slot.subject && 
        att.slot.startTime === slot.startTime
      );
      
      let status = 'upcoming';
      if (attendance) {
        const studentRecord = attendance.students.find(s => s.student.equals(student._id));
        status = studentRecord ? studentRecord.status : 'not_marked';
      }

      return {
        ...slot.toObject(),
        attendanceStatus: status
      };
    });

    // Overall attendance stats (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const totalAttendance = await Attendance.aggregate([
      {
        $match: {
          department: student.department,
          year: student.year,
          section: student.section,
          'students.student': student._id,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $unwind: '$students'
      },
      {
        $match: {
          'students.student': student._id
        }
      },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          presentClasses: {
            $sum: {
              $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const attendanceStats = totalAttendance[0] || { totalClasses: 0, presentClasses: 0 };
    const attendancePercentage = attendanceStats.totalClasses > 0 
      ? Math.round((attendanceStats.presentClasses / attendanceStats.totalClasses) * 100)
      : 0;

    // Get low attendance subjects using helper function
    const lowAttendanceSubjects = await getLowAttendanceSubjects(student._id);

    // Check today's task completion
    const todayTask = await StudentTask.findOne({
      student: student._id,
      date: { $gte: today_start, $lt: today_end }
    });

    const taskCompletion = todayTask ? {
      completed: todayTask.suggestedTasks.filter(t => t.completed).length,
      total: todayTask.suggestedTasks.length
    } : { completed: 0, total: 0 };

    res.json({
      student: {
        name: student.name,
        rollNumber: student.rollNumber,
        department: student.department,
        year: student.year,
        section: student.section,
        goals: student.goals,
        careerTarget: student.careerTarget
      },
      todaySchedule: classesWithAttendance,
      attendanceStats: {
        percentage: attendancePercentage,
        present: attendanceStats.presentClasses,
        total: attendanceStats.totalClasses,
        status: attendancePercentage < 75 ? 'critical' : 
                attendancePercentage < 80 ? 'warning' : 'good',
        lastUpdated: new Date().toISOString()
      },
      lowAttendanceSubjects: lowAttendanceSubjects.map(s => ({
        subject: s.subject,
        percentage: Math.round(s.attendancePercentage),
        missedClasses: s.totalClasses - s.presentCount
      })),
      todayProgress: {
        tasksCompleted: taskCompletion.completed,
        totalTasks: taskCompletion.total,
        percentage: taskCompletion.total > 0 ? 
          Math.round((taskCompletion.completed / taskCompletion.total) * 100) : 0
      },
      realTimeEnabled: true
    });
  } catch (error) {
    console.error('Student dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Enhanced Correction Request with Teacher Notification
router.post('/correction-request', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const { attendanceId, requestedStatus, reason } = req.body;
    
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const studentExists = attendance.students.some(s => s.student.equals(req.user._id));
    if (!studentExists) {
      return res.status(403).json({ message: 'You are not part of this class' });
    }

    const existingRequest = attendance.correctionRequests.find(r => 
      r.student.equals(req.user._id) && r.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({ message: 'Correction request already pending' });
    }

    attendance.correctionRequests.push({
      student: req.user._id,
      requestedStatus,
      reason
    });

    await attendance.save();

    // 🔥 NOTIFY TEACHER IN REAL-TIME
    const io = req.app.get('io');
    if (io) {
      const teacherRoom = `teacher-${attendance.teacher}`;
      io.to(teacherRoom).emit('new-correction-request', {
        type: 'NEW_CORRECTION_REQUEST',
        data: {
          attendanceId: attendance._id,
          subject: attendance.subject,
          student: req.user.name,
          rollNumber: req.user.rollNumber,
          requestedStatus,
          reason,
          requestTime: new Date().toISOString()
        },
        message: `New correction request from ${req.user.name}`
      });
    }

    res.json({ 
      message: 'Correction request submitted successfully',
      teacherNotified: true
    });
  } catch (error) {
    console.error('Correction request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join classroom for real-time updates
router.post('/join-classroom', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const student = req.user;
    
    res.json({
      success: true,
      classroom: {
        department: student.department,
        year: student.year,
        section: student.section,
        roomName: `class-${student.department}-${student.year}-${student.section}`
      },
      student: {
        name: student.name,
        rollNumber: student.rollNumber,
        id: student._id
      }
    });
  } catch (error) {
    console.error('Join classroom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Free Period Suggestions
router.get('/free-period-suggestions', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const student = await User.findById(req.user._id);
    
    // Check if profile is properly set up for personalized suggestions
    if (!student.preferencesSetup) {
      return res.status(400).json({
        message: 'Please complete your profile setup to get personalized suggestions',
        code: 'PROFILE_INCOMPLETE',
        requiredFields: ['interests', 'weakSubjects', 'goals'],
        nextStep: 'Update your profile at /api/student/profile'
      });
    }

    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    const todayDateString = today.toISOString().split('T')[0];

    // Get timetable from database (uploaded via admin route)
    const timetable = await Timetable.findOne({
      department: student.department,
      year: student.year,
      section: student.section
    });

    if (!timetable) {
      return res.json({ 
        message: 'No timetable found for your class',
        freePeriods: [], 
        suggestedTasks: [] 
      });
    }

    // Find today's schedule
    const daySchedule = timetable.schedule.find(s => 
      s.day.toLowerCase() === dayName.toLowerCase()
    );

    if (!daySchedule) {
      return res.json({ 
        message: 'No classes scheduled today',
        freePeriods: [], 
        suggestedTasks: [] 
      });
    }

    // Sort slots by time and calculate free periods
    const slots = daySchedule.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const freePeriods = [];
    
    // Check gaps between consecutive classes
    for (let i = 0; i < slots.length - 1; i++) {
      const currentEnd = slots[i].endTime;
      const nextStart = slots[i + 1].startTime;
      
      // Use current date for accurate time calculation
      const endTime = new Date(`${todayDateString}T${currentEnd}`);
      const startTime = new Date(`${todayDateString}T${nextStart}`);
      
      const gap = (startTime - endTime) / (1000 * 60); // gap in minutes
      
      if (gap > 15) { // Only consider gaps longer than 15 minutes
        freePeriods.push({
          startTime: currentEnd,
          endTime: nextStart,
          duration: gap,
          actualStartDateTime: endTime,
          actualEndDateTime: startTime
        });
      }
    }

    // Filter out free periods that have already passed
    const currentTime = today;
    const upcomingFreePeriods = freePeriods.filter(period => 
      period.actualEndDateTime > currentTime
    );

    if (upcomingFreePeriods.length === 0) {
      return res.json({ 
        message: 'No upcoming free periods today',
        freePeriods: [], 
        suggestedTasks: [] 
      });
    }

    // Generate personalized task suggestions
    const allSuggestedTasks = [];
    
    upcomingFreePeriods.forEach(period => {
      const periodTasks = [];

      // Check if this period is happening right now
      const isCurrentPeriod = currentTime >= period.actualStartDateTime && 
                             currentTime <= period.actualEndDateTime;

      // High priority tasks for weak subjects
      if (student.weakSubjects && student.weakSubjects.length > 0) {
        student.weakSubjects.forEach(subject => {
          if (period.duration >= 30) {
            periodTasks.push({
              title: `Practice ${subject} concepts`,
              description: `Review and practice problems in ${subject}`,
              type: 'practice',
              subject: subject,
              estimatedTime: Math.min(period.duration, 45),
              priority: isCurrentPeriod ? 9 : 8,
              resources: [`/resources/${subject.toLowerCase().replace(/\s+/g, '-')}-practice`],
              periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
            });
          }
        });
      }

      // Assignment completion tasks
      if (period.duration >= 45) {
        periodTasks.push({
          title: 'Complete pending assignments',
          description: 'Work on any pending coursework',
          type: 'assignment',
          estimatedTime: 45,
          priority: isCurrentPeriod ? 8 : 7,
          resources: [],
          periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
        });
      }

      // Interest-based learning
      if (student.interests && student.interests.length > 0) {
        student.interests.forEach(interest => {
          if (period.duration >= 20) {
            periodTasks.push({
              title: `Explore ${interest}`,
              description: `Learn something new about ${interest}`,
              type: 'interest',
              category: interest,
              estimatedTime: Math.min(period.duration, 30),
              priority: isCurrentPeriod ? 6 : 5,
              resources: [`/learning/${interest.toLowerCase().replace(/\s+/g, '-')}`],
              periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
            });
          }
        });
      }

      // Quick revision tasks for shorter periods
      if (period.duration >= 15 && period.duration < 30) {
        periodTasks.push({
          title: 'Quick revision',
          description: 'Review recent class notes',
          type: 'revision',
          estimatedTime: 15,
          priority: isCurrentPeriod ? 7 : 6,
          resources: ['/notes/recent'],
          periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
        });
      }

      // Goal-oriented tasks
      if (student.goals && student.goals.length > 0) {
        student.goals.forEach(goal => {
          if (period.duration >= 25) {
            periodTasks.push({
              title: `Work on: ${goal}`,
              description: `Make progress towards your goal: ${goal}`,
              type: 'goal',
              goal: goal,
              estimatedTime: Math.min(period.duration, 40),
              priority: isCurrentPeriod ? 8 : 7,
              resources: [],
              periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
            });
          }
        });
      }

      // Career target tasks
      if (student.careerTarget && period.duration >= 30) {
        periodTasks.push({
          title: `Career development: ${student.careerTarget}`,
          description: `Research or skill development for ${student.careerTarget}`,
          type: 'career',
          estimatedTime: Math.min(period.duration, 60),
          priority: isCurrentPeriod ? 7 : 6,
          resources: [`/career/${student.careerTarget.toLowerCase().replace(/\s+/g, '-')}`],
          periodStatus: isCurrentPeriod ? 'current' : 'upcoming'
        });
      }

      // Sort tasks by priority and add to main list
      const sortedTasks = periodTasks.sort((a, b) => b.priority - a.priority);
      allSuggestedTasks.push({
        period: {
          startTime: period.startTime,
          endTime: period.endTime,
          duration: period.duration,
          status: period.periodStatus
        },
        tasks: sortedTasks.slice(0, 3) // Limit to top 3 tasks per period
      });
    });

    // Save suggested tasks to database for tracking completion
    const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const today_end = new Date(today_start);
    today_end.setDate(today_end.getDate() + 1);

    const todayTask = await StudentTask.findOneAndUpdate(
      {
        student: student._id,
        date: { $gte: today_start, $lt: today_end }
      },
      {
        student: student._id,
        date: today,
        freePeriods: upcomingFreePeriods,
        suggestedTasks: allSuggestedTasks.flatMap(periodGroup => 
          periodGroup.tasks.map(task => ({
            ...task,
            completed: false,
            completedAt: null,
            period: periodGroup.period
          }))
        ),
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    // 🔥 REAL-TIME NOTIFICATION FOR CURRENT FREE PERIOD
    const io = req.app.get('io');
    const currentPeriodTasks = allSuggestedTasks.find(periodGroup => 
      periodGroup.period.status === 'current'
    );

    if (currentPeriodTasks && io) {
      const studentRoom = `student-${student._id}`;
      io.to(studentRoom).emit('free-period-started', {
        type: 'FREE_PERIOD_STARTED',
        data: {
          period: currentPeriodTasks.period,
          suggestedTasks: currentPeriodTasks.tasks,
          message: `Free period started! You have ${currentPeriodTasks.period.duration} minutes available.`
        }
      });
    }

    res.json({
      success: true,
      freePeriods: upcomingFreePeriods,
      suggestedTasks: allSuggestedTasks,
      currentPeriod: currentPeriodTasks ? currentPeriodTasks.period : null,
      realTimeEnabled: true,
      taskTrackingId: todayTask._id
    });

  } catch (error) {
    console.error('Free period suggestions error:', error);
    res.status(500).json({ message: 'Server error generating suggestions' });
  }
});

// Mark task as completed
router.put('/tasks/:taskId/complete', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const today = new Date();
    const today_start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const today_end = new Date(today_start);
    today_end.setDate(today_end.getDate() + 1);

    const studentTask = await StudentTask.findOne({
      student: req.user._id,
      date: { $gte: today_start, $lt: today_end }
    });

    if (!studentTask) {
      return res.status(404).json({ message: 'No tasks found for today' });
    }

    const task = studentTask.suggestedTasks.id(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.completed = true;
    task.completedAt = new Date();
    await studentTask.save();

    // 🔥 REAL-TIME PROGRESS UPDATE
    const io = req.app.get('io');
    if (io) {
      const studentRoom = `student-${req.user._id}`;
      
      const completedTasks = studentTask.suggestedTasks.filter(t => t.completed).length;
      const totalTasks = studentTask.suggestedTasks.length;
      const completionPercentage = Math.round((completedTasks / totalTasks) * 100);

      io.to(studentRoom).emit('task-completed', {
        type: 'TASK_COMPLETED',
        data: {
          taskId: task._id,
          taskTitle: task.title,
          completedTasks,
          totalTasks,
          completionPercentage,
          completedAt: task.completedAt
        }
      });
    }

    res.json({
      message: 'Task marked as completed',
      task: {
        id: task._id,
        title: task.title,
        completed: task.completed,
        completedAt: task.completedAt
      },
      progress: {
        completed: studentTask.suggestedTasks.filter(t => t.completed).length,
        total: studentTask.suggestedTasks.length
      }
    });
  } catch (error) {
    console.error('Task completion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance history for student
router.get('/attendance-history', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const { startDate, endDate, subject } = req.query;
    const studentId = req.user._id;

    let query = {
      'students.student': studentId,
      department: req.user.department,
      year: req.user.year,
      section: req.user.section
    };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (subject) query.subject = subject;

    const attendanceRecords = await Attendance.find(query)
      .populate('teacher', 'name')
      .select('date subject subjectCode slot students teacher classPhoto')
      .sort({ date: -1 })
      .limit(50);

    const formattedRecords = attendanceRecords.map(record => {
      const studentRecord = record.students.find(s => 
        s.student.toString() === studentId.toString()
      );
      
      return {
        _id: record._id,
        date: record.date,
        subject: record.subject,
        subjectCode: record.subjectCode,
        slot: record.slot,
        teacher: record.teacher.name,
        status: studentRecord ? studentRecord.status : 'absent',
        confidence: studentRecord ? studentRecord.confidence : null,
        manuallyMarked: studentRecord ? studentRecord.manuallyMarked : false,
        classPhoto: record.classPhoto,
        canRequestCorrection: studentRecord && studentRecord.status === 'absent'
      };
    });

    res.json({
      success: true,
      records: formattedRecords,
      total: formattedRecords.length,
      student: {
        name: req.user.name,
        rollNumber: req.user.rollNumber
      }
    });
  } catch (error) {
    console.error('Attendance history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific attendance record with details
router.get('/attendance/:attendanceId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const attendance = await Attendance.findById(req.params.attendanceId)
      .populate('teacher', 'name')
      .populate('students.student', 'name rollNumber profileImage');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const studentRecord = attendance.students.find(s => 
      s.student._id.toString() === req.user._id.toString()
    );

    if (!studentRecord) {
      return res.status(403).json({ message: 'You are not part of this class' });
    }

    const classStats = {
      totalStudents: attendance.totalStudents,
      presentCount: attendance.presentCount,
      absentCount: attendance.absentCount,
      attendancePercentage: attendance.attendancePercentage
    };

    const hasPendingCorrection = attendance.correctionRequests.some(req => 
      req.student.toString() === req.user._id.toString() && req.status === 'pending'
    );

    res.json({
      success: true,
      attendance: {
        _id: attendance._id,
        date: attendance.date,
        subject: attendance.subject,
        subjectCode: attendance.subjectCode,
        teacher: attendance.teacher.name,
        slot: attendance.slot,
        classPhoto: attendance.classPhoto,
        studentStatus: {
          status: studentRecord.status,
          confidence: studentRecord.confidence,
          manuallyMarked: studentRecord.manuallyMarked,
          recognized: studentRecord.confidence > 0.7
        },
        classStats,
        canRequestCorrection: studentRecord.status === 'absent' && !hasPendingCorrection,
        hasPendingCorrection,
        correctionRequests: attendance.correctionRequests.filter(req => 
          req.student.toString() === req.user._id.toString()
        )
      }
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update student profile for personalized suggestions
router.put('/profile', auth, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Student access required' });
        }

        const { 
            phone, 
            interests, 
            weakSubjects, 
            goals, 
            careerTarget 
            // Add other editable fields if needed (e.g., learningStyle, studyPreferences)
        } = req.body;

        const updateData = {
            // Basic/Editable Fields
            phone: phone, 
            
            // Academic Preferences
            interests: interests || [],
            weakSubjects: weakSubjects || [],
            goals: goals || '',
            careerTarget: careerTarget || '',
            
            // Always set to true upon saving preferences
            preferencesSetup: true, 
            profileUpdatedAt: new Date()
        };

        const updatedStudent = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { new: true }
        ).select('name interests weakSubjects goals careerTarget preferencesSetup');

        // 🔥 NOTIFY ABOUT PROFILE UPDATE (Socket.io logic)
        const io = req.app.get('io');
        if (io) {
            const studentRoom = `student-${req.user._id}`;
            io.to(studentRoom).emit('profile-updated', {
                type: 'PROFILE_UPDATED',
                data: {
                    message: 'Profile updated successfully',
                    preferencesSetup: true,
                    nextStep: 'Get personalized free period suggestions'
                }
            });
        }

        res.json({
            message: 'Profile updated successfully',
            student: updatedStudent,
            realTimeNotification: true
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error updating profile' });
    }
});


router.get('/profile', auth, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Student access required' });
        }

        // Fetch the full student document, excluding the sensitive password field
        const student = await User.findById(req.user._id).select('-password');
        
        if (!student) {
            return res.status(404).json({ message: 'Student user not found.' });
        }

        res.json({
            // Structure the response to match the frontend's interface
            profile: {
                basicInfo: {
                    // Fields set by Admin (View Only)
                    userId: student.userId,
                    name: student.name,
                    rollNumber: student.rollNumber,
                    department: student.department,
                    year: student.year,
                    section: student.section,
                    semester: student.semester,
                    email: student.email,
                    
                    // Editable fields
                    phone: student.phone,
                },
                academicPreferences: {
                    interests: student.interests || [],
                    weakSubjects: student.weakSubjects || [],
                    goals: student.goals || '',
                    careerTarget: student.careerTarget || '',
                    learningStyle: student.learningStyle || '',
                    studyPreferences: student.studyPreferences || {},
                },
                preferencesSetup: student.preferencesSetup || false
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Server error fetching profile data' });
    }
});

// Get student progress overview
router.get('/progress', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access required' });
    }

    const studentId = req.user._id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get attendance progress
    const attendanceProgress = await Attendance.aggregate([
      {
        $match: {
          'students.student': studentId,
          date: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: '$students' },
      {
        $match: {
          'students.student': studentId
        }
      },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          presentClasses: {
            $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get task completion progress
    const taskProgress = await StudentTask.aggregate([
      {
        $match: {
          student: studentId,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $project: {
          totalTasks: { $size: '$suggestedTasks' },
          completedTasks: {
            $size: {
              $filter: {
                input: '$suggestedTasks',
                as: 'task',
                cond: { $eq: ['$$task.completed', true] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: '$totalTasks' },
          completedTasks: { $sum: '$completedTasks' }
        }
      }
    ]);

    const attendance = attendanceProgress[0] || { totalClasses: 0, presentClasses: 0 };
    const tasks = taskProgress[0] || { totalTasks: 0, completedTasks: 0 };

    const attendancePercentage = attendance.totalClasses > 0 ?
      Math.round((attendance.presentClasses / attendance.totalClasses) * 100) : 0;
    
    const taskPercentage = tasks.totalTasks > 0 ?
      Math.round((tasks.completedTasks / tasks.totalTasks) * 100) : 0;

    // Get low attendance subjects
    const lowAttendanceSubjects = await getLowAttendanceSubjects(studentId);

    res.json({
      success: true,
      progress: {
        attendance: {
          percentage: attendancePercentage,
          present: attendance.presentClasses,
          total: attendance.totalClasses,
          status: attendancePercentage >= 80 ? 'good' : 
                  attendancePercentage >= 75 ? 'warning' : 'critical'
        },
        tasks: {
          percentage: taskPercentage,
          completed: tasks.completedTasks,
          total: tasks.totalTasks,
          status: taskPercentage >= 70 ? 'good' :
                  taskPercentage >= 50 ? 'warning' : 'critical'
        },
        lowAttendanceSubjects: lowAttendanceSubjects.map(s => ({
          subject: s.subject,
          percentage: Math.round(s.attendancePercentage),
          improvementNeeded: 80 - Math.round(s.attendancePercentage)
        })),
        lastUpdated: new Date().toISOString()
      },
      recommendations: lowAttendanceSubjects.length > 0 ? [
        `Focus on improving attendance in ${lowAttendanceSubjects[0].subject}`,
        'Complete suggested tasks during free periods',
        'Review class materials regularly'
      ] : [
        'Maintain your good attendance record',
        'Continue completing suggested tasks',
        'Set higher goals for academic performance'
      ]
    });
  } catch (error) {
    console.error('Progress overview error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;