const express = require('express');
const multer = require('multer');
const User = require('../model/User');
const Timetable = require('../model/Timetable');
const Department = require('../model/Department');
const Attendance = require('../model/Attendance');
const { auth, teacherAuth } = require('../middleware/auth');
const faceRecognitionService = require('../services/faceRecognitionService');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/class-photos/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Helper function to trigger analytics updates
// Enhanced Helper function to trigger analytics updates with real-time admin/HOD broadcasts
const updateAllAnalytics = async (department, year, section, teacherId, attendanceId, eventType = 'ATTENDANCE_MARKED') => {
  try {
    console.log(`📊 Updating analytics for ${department}-${year}-${section}`);
    const io = req.app.get('io');
    
    // Update student dashboards (triggers recalculation)
    const StudentTask = require('../model/StudentTask');
    const students = await User.find({
      department, year, section, role: 'student'
    }).select('_id');
    
    const studentIds = students.map(s => s._id);
    
    await StudentTask.updateMany(
      { student: { $in: studentIds } },
      { $set: { lastAnalyticsUpdate: new Date() } }
    );
    
    // Update teacher last activity
    await User.findByIdAndUpdate(teacherId, {
      lastActivity: new Date()
    });
    
    // Update attendance record
    await Attendance.findByIdAndUpdate(attendanceId, {
      analyticsUpdated: true
    });
    
    // 🔥 REAL-TIME ADMIN/HOD DASHBOARD UPDATES
    if (io) {
      // Broadcast to all admin dashboards
      io.to('admin-dashboard').emit('admin-dashboard-refresh', {
        type: 'DASHBOARD_REFRESH_NEEDED',
        data: {
          eventType,
          department,
          year,
          section,
          attendanceId,
          timestamp: new Date().toISOString(),
          message: `New ${eventType.toLowerCase()} in ${department}-${year}-${section}`
        }
      });

      // Broadcast to specific HOD dashboard
      const departmentDoc = await Department.findOne({ code: department });
      if (departmentDoc && departmentDoc.hod) {
        const hodRoom = `hod-${departmentDoc.hod}`;
        io.to(hodRoom).emit('hod-dashboard-refresh', {
          type: 'HOD_DASHBOARD_REFRESH',
          data: {
            eventType,
            department,
            year,
            section,
            attendanceId,
            timestamp: new Date().toISOString(),
            message: `New attendance marked in your department`
          }
        });
      }
    }
    
    console.log('✅ Analytics update triggered with real-time broadcasts');
  } catch (error) {
    console.error('❌ Analytics update error:', error);
  }
};

// Get today's classes for teacher
router.get('/today-classes', [auth, teacherAuth], async (req, res) => {
  try {
    const teacherId = req.user._id;
    const today = new Date();
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = daysOfWeek[today.getDay()];

    const timetables = await Timetable.find({
      'schedule.slots.teacher': teacherId
    });

    const todayClasses = [];

    timetables.forEach(timetable => {
      timetable.schedule.forEach(daySchedule => {
        if (daySchedule.day.trim().toLowerCase() === currentDay.toLowerCase()) {
          daySchedule.slots.forEach(slot => {
            if (slot.teacher && slot.teacher.toString() === teacherId.toString()) {
              todayClasses.push({
                department: timetable.department,
                year: timetable.year,
                section: timetable.section,
                semester: timetable.semester,
                academicYear: timetable.academicYear,
                day: daySchedule.day,
                startTime: slot.startTime,
                endTime: slot.endTime,
                subject: slot.subject,
                subjectCode: slot.subjectCode,
                type: slot.type,
                room: slot.room
              });
            }
          });
        }
      });
    });

    res.json(todayClasses);

  } catch (error) {
    console.error('Today classes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// MARK ATTENDANCE WITH REAL-TIME DISPLAY TO ALL STUDENT PHONES
router.post(
  "/mark-attendance",
  [auth, teacherAuth, upload.single("classPhoto")],
  async (req, res) => {
    try {
      const { department, year, section, subject, subjectCode, startTime, endTime } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Class photo is required" });
      }

      // Get Socket.io instance for real-time broadcasting
      const io = req.app.get('io');

      // Fetch active students in that class
      const students = await User.find({
        role: "student",
        department,
        year: parseInt(year),
        section,
        isActive: true,
      }).select('name rollNumber userId profileImage');

      console.log(`📊 Found ${students.length} students for attendance`);

      // Run face recognition service
      const recognitionResults = await faceRecognitionService.processClassPhoto(
        req.file.path,
        students
      );

      // Save attendance to database
      const attendance = new Attendance({
        date: new Date(),
        department,
        year: parseInt(year),
        section,
        subject,
        subjectCode,
        teacher: req.user._id,
        slot: { startTime, endTime },
        classPhoto: req.file.path,
        students: recognitionResults.students,
        totalStudents: students.length,
        presentCount: recognitionResults.presentCount,
        absentCount: recognitionResults.absentCount,
        attendancePercentage: recognitionResults.attendancePercentage,
        unrecognizedFaces: recognitionResults.unrecognizedFaces || [],
      });

      await attendance.save();

      // Populate teacher + student details
      const populatedAttendance = await Attendance.findById(attendance._id)
        .populate("students.student", "name rollNumber profileImage")
        .populate("teacher", "name email");

      // 🔥 REAL-TIME BROADCAST TO ALL STUDENT PHONES
      const classroomRoom = `class-${department}-${year}-${section}`;
      
      const broadcastData = {
        type: 'ATTENDANCE_MARKED',
        data: {
          attendanceId: populatedAttendance._id,
          subject: populatedAttendance.subject,
          date: populatedAttendance.date,
          teacher: populatedAttendance.teacher.name,
          slot: populatedAttendance.slot,
          summary: {
            totalStudents: populatedAttendance.totalStudents,
            presentCount: populatedAttendance.presentCount,
            absentCount: populatedAttendance.absentCount,
            attendancePercentage: populatedAttendance.attendancePercentage,
            unrecognizedFaces: populatedAttendance.unrecognizedFaces
          },
          students: populatedAttendance.students.map(s => ({
            studentId: s.student._id.toString(),
            name: s.student.name,
            rollNumber: s.student.rollNumber,
            profileImage: s.student.profileImage,
            status: s.status,
            confidence: s.confidence,
            manuallyMarked: s.manuallyMarked
          })),
          timestamp: new Date().toISOString()
        }
      };

      // Broadcast to all students in the classroom
      io.to(classroomRoom).emit('attendance-marked', broadcastData);

      // Also send confirmation to teacher
      const teacherRoom = `teacher-${req.user._id}`;
      io.to(teacherRoom).emit('attendance-complete', {
        type: 'ATTENDANCE_COMPLETE',
        data: broadcastData,
        message: 'Attendance successfully marked and broadcasted to students'
      });

      // 🔥 TRIGGER ANALYTICS UPDATE
      await updateAllAnalytics(
        department, 
        parseInt(year), 
        section, 
        req.user._id,
        attendance._id
      );

      console.log(`📢 Broadcasted attendance to ${classroomRoom} - ${populatedAttendance.presentCount} present`);

      // Response to teacher
      res.json({
        message: "Attendance processed and broadcasted to all students",
        success: true,
        data: broadcastData,
        broadcasted: true,
        analyticsUpdated: true,
        room: classroomRoom,
        attendance: populatedAttendance
      });

    } catch (error) {
      console.error("Mark attendance error:", error);
      
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        message: "Server error during attendance processing",
        error: error.message 
      });
    }
  }
);

// MANUAL ATTENDANCE CORRECTION WITH REAL-TIME UPDATES & ANALYTICS
router.put('/attendance/:id', [auth, teacherAuth], async (req, res) => {
  try {
    const { students } = req.body;
    const io = req.app.get('io');
    
    const attendance = await Attendance.findOne({
      _id: req.params.id,
      teacher: req.user._id
    }).populate('students.student', 'name rollNumber profileImage');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Update attendance with manual corrections
    attendance.students = students.map(student => ({
      ...student,
      manuallyMarked: true
    }));

    // Recalculate counts
    attendance.presentCount = students.filter(s => s.status === 'present').length;
    attendance.absentCount = students.filter(s => s.status === 'absent').length;
    attendance.attendancePercentage = (attendance.presentCount / attendance.totalStudents) * 100;

    await attendance.save();

    // 🔥 BROADCAST MANUAL CORRECTION TO ALL STUDENTS
    const classroomRoom = `class-${attendance.department}-${attendance.year}-${attendance.section}`;
    
    const broadcastData = {
      type: 'ATTENDANCE_CORRECTED',
      data: {
        attendanceId: attendance._id,
        subject: attendance.subject,
        teacher: req.user.name,
        correctionType: 'MANUAL_UPDATE',
        students: attendance.students.map(s => ({
          studentId: s.student._id.toString(),
          name: s.student.name,
          rollNumber: s.student.rollNumber,
          profileImage: s.student.profileImage,
          status: s.status,
          manuallyMarked: s.manuallyMarked
        })),
        summary: {
          totalStudents: attendance.totalStudents,
          presentCount: attendance.presentCount,
          absentCount: attendance.absentCount,
          attendancePercentage: attendance.attendancePercentage
        },
        correctedAt: new Date().toISOString()
      }
    };

    io.to(classroomRoom).emit('attendance-corrected', broadcastData);

    // 🔥 TRIGGER ANALYTICS UPDATE
    await updateAllAnalytics(
      attendance.department, 
      attendance.year, 
      attendance.section, 
      req.user._id,
      attendance._id
    );

    // 🔥 BROADCAST ANALYTICS UPDATE TO DASHBOARDS
    io.to(classroomRoom).emit('dashboard-updated', {
      type: 'DASHBOARD_UPDATED',
      data: {
        message: 'Attendance analytics updated after correction',
        updatedAt: new Date().toISOString(),
        summary: {
          presentCount: attendance.presentCount,
          attendancePercentage: attendance.attendancePercentage
        }
      }
    });

    // Also notify teacher
    const teacherRoom = `teacher-${req.user._id}`;
    io.to(teacherRoom).emit('correction-complete', {
      type: 'CORRECTION_COMPLETE',
      data: {
        message: 'Manual correction applied and analytics updated',
        attendanceId: attendance._id
      }
    });

    res.json({ 
      message: 'Attendance updated, corrections broadcasted, and analytics recalculated', 
      attendance,
      broadcasted: true,
      analyticsUpdated: true,
      room: classroomRoom
    });
  } catch (error) {
    console.error('Manual attendance update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CORRECTION REQUEST APPROVAL WITH REAL-TIME UPDATES & ANALYTICS
router.put('/correction-requests/:attendanceId/:requestId', [auth, teacherAuth], async (req, res) => {
  try {
    const { status, adminComment } = req.body;
    const io = req.app.get('io');
    
    const attendance = await Attendance.findOne({
      _id: req.params.attendanceId,
      teacher: req.user._id,
      'correctionRequests._id': req.params.requestId
    }).populate('correctionRequests.student', 'name rollNumber')
      .populate('students.student', 'name rollNumber profileImage');

    if (!attendance) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const request = attendance.correctionRequests.id(req.params.requestId);
    request.status = status;
    request.adminComment = adminComment;

    if (status === 'approved') {
      const studentAttendance = attendance.students.find(s => 
        s.student.equals(request.student)
      );
      if (studentAttendance) {
        studentAttendance.status = request.requestedStatus;
        studentAttendance.manuallyMarked = true;
        
        // Recalculate counts
        attendance.presentCount = attendance.students.filter(s => s.status === 'present').length;
        attendance.absentCount = attendance.students.filter(s => s.status === 'absent').length;
        attendance.attendancePercentage = (attendance.presentCount / attendance.totalStudents) * 100;
      }

      // 🔥 BROADCAST CORRECTION APPROVAL TO ALL STUDENTS
      const classroomRoom = `class-${attendance.department}-${attendance.year}-${attendance.section}`;
      
      const broadcastData = {
        type: 'CORRECTION_APPROVED',
        data: {
          attendanceId: attendance._id,
          subject: attendance.subject,
          student: {
            name: request.student.name,
            rollNumber: request.student.rollNumber,
            oldStatus: studentAttendance ? studentAttendance.status : 'unknown',
            newStatus: request.requestedStatus
          },
          correctedBy: req.user.name,
          summary: {
            totalStudents: attendance.totalStudents,
            presentCount: attendance.presentCount,
            attendancePercentage: attendance.attendancePercentage
          },
          approvedAt: new Date().toISOString()
        }
      };

      io.to(classroomRoom).emit('correction-approved', broadcastData);

      // 🔥 TRIGGER ANALYTICS UPDATE
      await updateAllAnalytics(
        attendance.department, 
        attendance.year, 
        attendance.section, 
        req.user._id,
        attendance._id
      );

      // 🔥 NOTIFY SPECIFIC STUDENT ABOUT APPROVAL
      const studentRoom = `student-${request.student._id}`;
      io.to(studentRoom).emit('correction-approved-personal', {
        type: 'CORRECTION_APPROVED_PERSONAL',
        data: {
          subject: attendance.subject,
          newStatus: request.requestedStatus,
          approvedBy: req.user.name,
          message: 'Your correction request has been approved'
        }
      });
    }

    await attendance.save();
    
    res.json({ 
      message: `Correction request ${status} successfully`,
      broadcasted: status === 'approved',
      analyticsUpdated: status === 'approved'
    });
  } catch (error) {
    console.error('Correction request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET ATTENDANCE DISPLAY FOR TEACHER
router.get('/attendance-display/:attendanceId', [auth, teacherAuth], async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.attendanceId)
      .populate('students.student', 'name rollNumber profileImage')
      .populate('teacher', 'name')
      .populate('correctionRequests.student', 'name rollNumber');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Verify teacher owns this attendance
    if (attendance.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const displayData = {
      attendanceId: attendance._id,
      subject: attendance.subject,
      date: attendance.date,
      teacher: attendance.teacher.name,
      slot: attendance.slot,
      classPhoto: attendance.classPhoto,
      summary: {
        totalStudents: attendance.totalStudents,
        presentCount: attendance.presentCount,
        absentCount: attendance.absentCount,
        attendancePercentage: attendance.attendancePercentage,
        unrecognizedFaces: attendance.unrecognizedFaces
      },
      students: attendance.students.map(s => ({
        studentId: s.student._id,
        name: s.student.name,
        rollNumber: s.student.rollNumber,
        profileImage: s.student.profileImage,
        status: s.status,
        confidence: s.confidence,
        manuallyMarked: s.manuallyMarked
      })),
      pendingCorrections: attendance.correctionRequests.filter(r => r.status === 'pending').length,
      isConfirmed: attendance.isConfirmed,
      analyticsUpdated: attendance.analyticsUpdated
    };

    res.json({
      success: true,
      data: displayData
    });

  } catch (error) {
    console.error('Attendance display error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// CONFIRM ATTENDANCE (FINALIZE)
router.put('/attendance/:id/confirm', [auth, teacherAuth], async (req, res) => {
  try {
    const io = req.app.get('io');
    
    const attendance = await Attendance.findOneAndUpdate(
      { _id: req.params.id, teacher: req.user._id },
      { isConfirmed: true },
      { new: true }
    ).populate('students.student', 'name rollNumber');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // 🔥 BROADCAST CONFIRMATION TO STUDENTS
    const classroomRoom = `class-${attendance.department}-${attendance.year}-${attendance.section}`;
    
    io.to(classroomRoom).emit('attendance-confirmed', {
      type: 'ATTENDANCE_CONFIRMED',
      data: {
        attendanceId: attendance._id,
        subject: attendance.subject,
        confirmedAt: new Date().toISOString(),
        message: 'Attendance has been finalized and confirmed'
      }
    });

    // 🔥 TRIGGER FINAL ANALYTICS UPDATE
    await updateAllAnalytics(
      attendance.department, 
      attendance.year, 
      attendance.section, 
      req.user._id,
      attendance._id
    );

    res.json({ 
      message: 'Attendance confirmed and analytics updated', 
      attendance,
      broadcasted: true,
      analyticsUpdated: true
    });
  } catch (error) {
    console.error('Attendance confirmation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET ATTENDANCE HISTORY
router.get('/attendance-history', [auth, teacherAuth], async (req, res) => {
  try {
    const { startDate, endDate, subject, department, year, section } = req.query;
    
    let query = { teacher: req.user._id };
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (subject) query.subject = subject;
    if (department) query.department = department;
    if (year) query.year = parseInt(year);
    if (section) query.section = section;

    const attendanceRecords = await Attendance.find(query)
      .populate('students.student', 'name rollNumber')
      .sort({ date: -1 })
      .limit(50);

    res.json(attendanceRecords);
  } catch (error) {
    console.error('Attendance history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET PENDING CORRECTION REQUESTS
router.get('/correction-requests', [auth, teacherAuth], async (req, res) => {
  try {
    const requests = await Attendance.find({
      teacher: req.user._id,
      'correctionRequests.status': 'pending'
    }).populate('correctionRequests.student', 'name rollNumber')
      .populate('students.student', 'name rollNumber');

    // Format response
    const formattedRequests = requests.flatMap(attendance => 
      attendance.correctionRequests
        .filter(req => req.status === 'pending')
        .map(req => ({
          attendanceId: attendance._id,
          requestId: req._id,
          subject: attendance.subject,
          date: attendance.date,
          student: {
            name: req.student.name,
            rollNumber: req.student.rollNumber
          },
          requestedStatus: req.requestedStatus,
          reason: req.reason,
          requestDate: req.requestDate
        }))
    );

    res.json(formattedRequests);
  } catch (error) {
    console.error('Correction requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;