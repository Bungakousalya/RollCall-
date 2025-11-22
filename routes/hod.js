const express = require('express');
const User = require('../model/User');
const Department = require('../model/Department');
const Attendance = require('../model/Attendance');
const Timetable = require('../model/Timetable');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Middleware to check if user is HOD
const hodAuth = async (req, res, next) => {
  try {
    const department = await Department.findOne({ hod: req.user._id });
    if (!department) {
      return res.status(403).json({ message: 'HOD access required' });
    }
    req.department = department;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Join HOD dashboard for real-time updates
router.post('/join-dashboard', [auth, hodAuth], async (req, res) => {
  try {
    const department = req.department;
    
    res.json({
      success: true,
      dashboard: {
        department: department.name,
        code: department.code,
        roomName: `hod-${req.user._id}`,
        realTimeEnabled: true
      },
      hod: {
        name: req.user.name,
        id: req.user._id
      }
    });
  } catch (error) {
    console.error('Join HOD dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Enhanced HOD Dashboard with real-time support
router.get('/dashboard', [auth, hodAuth], async (req, res) => {
  try {
    const department = req.department;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Department Statistics
    const deptStats = await Attendance.aggregate([
      {
        $match: { 
          department: department.code,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          avgAttendance: { $avg: '$attendancePercentage' },
          totalPresent: { $sum: '$presentCount' },
          totalStudents: { $sum: '$totalStudents' }
        }
      }
    ]);

    // Real-time activity feed (last 10 activities)
    const recentActivity = await Attendance.find({ 
      department: department.code 
    })
    .populate('teacher', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('subject teacher date presentCount totalStudents attendancePercentage')
    .lean();

    const formattedActivity = recentActivity.map(activity => ({
      type: 'attendance_marked',
      teacher: activity.teacher?.name || 'Unknown',
      subject: activity.subject,
      present: activity.presentCount,
      total: activity.totalStudents,
      percentage: Math.round(activity.attendancePercentage),
      time: activity.date,
      timestamp: activity.createdAt
    }));

    // Year-wise attendance
    const yearWiseStats = await Attendance.aggregate([
      {
        $match: { 
          department: department.code,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$year',
          avgAttendance: { $avg: '$attendancePercentage' },
          totalClasses: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Subject-wise attendance
    const subjectStats = await Attendance.aggregate([
      {
        $match: { 
          department: department.code,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$subject',
          avgAttendance: { $avg: '$attendancePercentage' },
          totalClasses: { $sum: 1 }
        }
      },
      { $sort: { avgAttendance: -1 } }
    ]);

    // Low attendance students (< 75%)
    const lowAttendanceStudents = await Attendance.aggregate([
      {
        $match: { 
          department: department.code,
          date: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: '$students' },
      {
        $group: {
          _id: '$students.student',
          presentCount: {
            $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
          },
          totalClasses: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'studentInfo'
        }
      },
      { $unwind: '$studentInfo' },
      {
        $project: {
          name: '$studentInfo.name',
          rollNumber: '$studentInfo.rollNumber',
          year: '$studentInfo.year',
          section: '$studentInfo.section',
          presentCount: 1,
          totalClasses: 1,
          attendancePercentage: {
            $multiply: [{ $divide: ['$presentCount', '$totalClasses'] }, 100]
          }
        }
      },
      {
        $match: {
          attendancePercentage: { $lt: 75 }
        }
      },
      { $sort: { attendancePercentage: 1 } }
    ]);

    // Department teachers
    const teachers = await User.find({ 
      departmentAssigned: department.code,
      role: 'teacher'
    }).select('name email subjectsHandled lastActivity');

    // Total students in department
    const totalStudents = await User.countDocuments({ 
      department: department.code, 
      role: 'student' 
    });

    const stats = deptStats[0] || { 
      totalClasses: 0, 
      avgAttendance: 0, 
      totalPresent: 0, 
      totalStudents: 0 
    };

    res.json({
      department: {
        name: department.name,
        code: department.code,
        hod: req.user.name
      },
      overview: {
        totalStudents,
        totalTeachers: teachers.length,
        totalClasses: stats.totalClasses,
        avgAttendance: Math.round(stats.avgAttendance || 0),
        lowAttendanceCount: lowAttendanceStudents.length,
        lastUpdated: new Date().toISOString()
      },
      yearWiseStats: yearWiseStats.map(stat => ({
        year: stat._id,
        avgAttendance: Math.round(stat.avgAttendance || 0),
        totalClasses: stat.totalClasses
      })),
      subjectStats: subjectStats.map(stat => ({
        subject: stat._id,
        avgAttendance: Math.round(stat.avgAttendance || 0),
        totalClasses: stat.totalClasses
      })),
      lowAttendanceStudents: lowAttendanceStudents.map(student => ({
        name: student.name,
        rollNumber: student.rollNumber,
        year: student.year,
        section: student.section,
        presentCount: student.presentCount,
        totalClasses: student.totalClasses,
        attendancePercentage: Math.round(student.attendancePercentage)
      })),
      teachers,
      recentActivity: formattedActivity,
      realTimeEnabled: true,
      refreshEvents: [
        'ATTENDANCE_MARKED',
        'ATTENDANCE_CORRECTED', 
        'CORRECTION_APPROVED',
        'ATTENDANCE_CONFIRMED'
      ]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Real-time stats endpoint for quick updates
router.get('/live-stats', [auth, hodAuth], async (req, res) => {
  try {
    const department = req.department;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deptStats = await Attendance.aggregate([
      {
        $match: { 
          department: department.code,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          avgAttendance: { $avg: '$attendancePercentage' },
          totalPresent: { $sum: '$presentCount' }
        }
      }
    ]);

    const stats = deptStats[0] || { 
      totalClasses: 0, 
      avgAttendance: 0, 
      totalPresent: 0
    };

    res.json({
      totalClasses: stats.totalClasses,
      avgAttendance: Math.round(stats.avgAttendance || 0),
      totalPresent: stats.totalPresent,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ... (keep your existing HOD routes: attendance-history, students, student-report, teacher-report)

// Department Attendance History
router.get('/attendance-history', [auth, hodAuth], async (req, res) => {
  try {
    const { year, section, subject, startDate, endDate } = req.query;
    const department = req.department;

    let matchQuery = { department: department.code };
    
    if (year) matchQuery.year = parseInt(year);
    if (section) matchQuery.section = section;
    if (subject) matchQuery.subject = subject;
    if (startDate && endDate) {
      matchQuery.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendanceHistory = await Attendance.find(matchQuery)
      .populate('teacher', 'name')
      .populate('students.student', 'name rollNumber')
      .sort({ date: -1 })
      .limit(50);

    res.json(attendanceHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Department Students List
router.get('/students', [auth, hodAuth], async (req, res) => {
  try {
    const { year, section } = req.query;
    const department = req.department;

    let query = { 
      department: department.code, 
      role: 'student',
      isActive: true 
    };
    
    if (year) query.year = parseInt(year);
    if (section) query.section = section;

    const students = await User.find(query)
      .select('name rollNumber email phone year section semester')
      .sort({ year: 1, section: 1, rollNumber: 1 });

    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Student-wise Attendance Report
router.get('/student-report/:studentId', [auth, hodAuth], async (req, res) => {
  try {
    const department = req.department;
    const studentId = req.params.studentId;

    // Verify student belongs to HOD's department
    const student = await User.findOne({
      _id: studentId,
      department: department.code,
      role: 'student'
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found in your department' });
    }

    const attendanceReport = await Attendance.aggregate([
      {
        $match: {
          department: department.code,
          'students.student': student._id
        }
      },
      { $unwind: '$students' },
      {
        $match: {
          'students.student': student._id
        }
      },
      {
        $group: {
          _id: {
            subject: '$subject',
            month: { $month: '$date' },
            year: { $year: '$date' }
          },
          totalClasses: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          subject: '$_id.subject',
          month: '$_id.month',
          year: '$_id.year',
          totalClasses: 1,
          presentCount: 1,
          attendancePercentage: {
            $multiply: [{ $divide: ['$presentCount', '$totalClasses'] }, 100]
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    // Overall attendance
    const overallStats = await Attendance.aggregate([
      {
        $match: {
          department: department.code,
          'students.student': student._id
        }
      },
      { $unwind: '$students' },
      {
        $match: {
          'students.student': student._id
        }
      },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          presentCount: {
            $sum: { $cond: [{ $eq: ['$students.status', 'present'] }, 1, 0] }
          }
        }
      }
    ]);

    const overall = overallStats[0] || { totalClasses: 0, presentCount: 0 };

    res.json({
      student: {
        name: student.name,
        rollNumber: student.rollNumber,
        year: student.year,
        section: student.section,
        department: student.department
      },
      overall: {
        totalClasses: overall.totalClasses,
        presentCount: overall.presentCount,
        attendancePercentage: overall.totalClasses > 0 ? 
          Math.round((overall.presentCount / overall.totalClasses) * 100) : 0
      },
      subjectWiseReport: attendanceReport
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Teacher Performance Report
router.get('/teacher-report', [auth, hodAuth], async (req, res) => {
  try {
    const department = req.department;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const teacherPerformance = await Attendance.aggregate([
      {
        $match: {
          department: department.code,
          date: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$teacher',
          totalClasses: { $sum: 1 },
          avgAttendance: { $avg: '$attendancePercentage' },
          totalStudents: { $sum: '$totalStudents' },
          totalPresent: { $sum: '$presentCount' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'teacherInfo'
        }
      },
      { $unwind: '$teacherInfo' },
      {
        $project: {
          teacherName: '$teacherInfo.name',
          teacherEmail: '$teacherInfo.email',
          totalClasses: 1,
          avgAttendance: { $round: ['$avgAttendance', 2] },
          totalStudents: 1,
          totalPresent: 1
        }
      },
      { $sort: { avgAttendance: -1 } }
    ]);

    res.json(teacherPerformance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;