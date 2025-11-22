const express = require('express');
const Attendance = require('../model/Attendance');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/:id', auth, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('teacher', 'name')
      .populate('students.student', 'name rollNumber profileImage')
      .populate('correctionRequests.student', 'name rollNumber');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const hasAccess = 
      req.user.role === 'admin' ||
      (req.user.role === 'teacher' && attendance.teacher.equals(req.user._id)) ||
      (req.user.role === 'student' && 
       attendance.department === req.user.department &&
       attendance.year === req.user.year &&
       attendance.section === req.user.section);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;