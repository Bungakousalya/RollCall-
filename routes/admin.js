// const express = require('express');
// const multer = require('multer');
// const XLSX = require('xlsx');
// const path = require('path');
// const fs = require('fs');
// const User = require('../model/User');
// const Department = require('../model/Department');
// const Timetable = require('../model/Timetable');
// const Attendance = require('../model/Attendance');
// const { auth, adminAuth } = require('../middleware/auth');

// const router = express.Router();
// const DEEPFACE_PHOTOS_DIR = path.join(__dirname, '..', 'deepface_service', 'uploads', 'student-photos');

// // Ensure the directory exists
// if (!fs.existsSync(DEEPFACE_PHOTOS_DIR)) {
//   fs.mkdirSync(DEEPFACE_PHOTOS_DIR, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     if (file.fieldname === 'photos') {
//       cb(null, 'uploads/temp-photos'); // temp folder
//     } else {
//       cb(null, 'uploads/'); // excel and other files
//     }
//   },
//   filename: (req, file, cb) => {
//     cb(null, file.originalname); // keep original name (important for matching!)
//   }
// });




// const upload = multer({ storage });

// router.get('/dashboard', [auth, adminAuth], async (req, res) => {
//   try {
//     // Basic counts
//     const totalStudents = await User.countDocuments({ role: 'student', isActive: true });
//     const totalTeachers = await User.countDocuments({ role: 'teacher', isActive: true });
//     const totalDepartments = await Department.countDocuments();

//     // Today's date range
//     const today = new Date();
//     const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const todayEnd = new Date(todayStart);
//     todayEnd.setDate(todayEnd.getDate() + 1);

//     // Today's attendance stats
//     const todayAttendance = await Attendance.aggregate([
//       { 
//         $match: { 
//           date: { $gte: todayStart, $lt: todayEnd } 
//         } 
//       },
//       {
//         $group: {
//           _id: null,
//           totalPresent: { $sum: '$presentCount' },
//           totalAbsent: { $sum: '$absentCount' },
//           totalClasses: { $sum: 1 },
//           avgAttendance: { $avg: '$attendancePercentage' }
//         }
//       }
//     ]);

//     // Get today's classes from timetable
//     const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
//     const totalClassesToday = await Timetable.aggregate([
//       { $unwind: '$schedule' },
//       { $unwind: '$schedule.slots' },
//       { 
//         $match: { 
//           'schedule.day': dayName 
//         } 
//       },
//       {
//         $group: {
//           _id: null,
//           totalClasses: { $sum: 1 }
//         }
//       }
//     ]);

//     // Department-wise attendance (last 30 days)
//     const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
//     const deptAttendance = await Attendance.aggregate([
//       { 
//         $match: { 
//           date: { $gte: thirtyDaysAgo } 
//         } 
//       },
//       {
//         $group: {
//           _id: '$department',
//           avgAttendance: { $avg: '$attendancePercentage' },
//           totalClasses: { $sum: 1 },
//           totalPresent: { $sum: '$presentCount' },
//           totalStudents: { $sum: '$totalStudents' }
//         }
//       },
//       { $sort: { avgAttendance: -1 } }
//     ]);

//     // Recent activity (last 5 attendance records)
//     const recentActivity = await Attendance.find({})
//       .populate('teacher', 'name')
//       .sort({ createdAt: -1 })
//       .limit(5)
//       .select('subject teacher date presentCount totalStudents')
//       .lean();

//     const formattedActivity = recentActivity.map(activity => ({
//       type: 'attendance_marked',
//       teacher: activity.teacher?.name || 'Unknown',
//       subject: activity.subject,
//       present: activity.presentCount,
//       total: activity.totalStudents,
//       percentage: Math.round((activity.presentCount / activity.totalStudents) * 100),
//       time: activity.date
//     }));

//     // Prepare response
//     const todayStats = todayAttendance[0] || { 
//       totalPresent: 0, 
//       totalAbsent: 0, 
//       totalClasses: 0, 
//       avgAttendance: 0 
//     };

//     const classesToday = totalClassesToday[0] || { totalClasses: 0 };

//     res.json({
//       stats: {
//         totalStudents,
//         totalTeachers,
//         totalDepartments,
//         totalClassesToday: classesToday.totalClasses,
//         todayAttendance: {
//           totalPresent: todayStats.totalPresent,
//           totalAbsent: todayStats.totalAbsent,
//           totalClasses: todayStats.totalClasses,
//           avgAttendance: Math.round(todayStats.avgAttendance || 0)
//         }
//       },
//       deptAttendance: deptAttendance.map(dept => ({
//         department: dept._id,
//         avgAttendance: Math.round(dept.avgAttendance || 0),
//         totalClasses: dept.totalClasses,
//         totalStudents: dept.totalStudents,
//         totalPresent: dept.totalPresent
//       })),
//       recentActivity: formattedActivity,
//       lastUpdated: new Date()
//     });
//   } catch (error) {
//     console.error('Dashboard error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.post(
//   '/upload-students',
//   [auth, adminAuth, upload.fields([
//     { name: 'excel', maxCount: 1 },
//     { name: 'photos', maxCount: 100 }
//   ])],
//   async (req, res) => {
//     try {
//       if (!req.files.excel) {
//         return res.status(400).json({ message: 'Excel file is required' });
//       }

//       // Read Excel
//       const workbook = XLSX.readFile(req.files.excel[0].path);
//       const worksheet = workbook.Sheets[workbook.SheetNames[0]];
//       const students = XLSX.utils.sheet_to_json(worksheet);

//       const createdStudents = [];
//       const errors = [];

//       for (let i = 0; i < students.length; i++) {
//         const studentData = students[i];
//         try {
//           let finalImagePath = '';

//           // Unique identifier from Excel
//           const studentIdFromExcel = studentData.userId || studentData.rollNumber;
//           if (!studentIdFromExcel) {
//             throw new Error("Row in Excel is missing 'userId' or 'rollNumber'.");
//           }

//           if (req.files.photos) {
//             // Find photo matching Excel ID
//             const photo = req.files.photos.find(file =>
//               path.parse(file.originalname).name.toLowerCase() === studentIdFromExcel.toString().toLowerCase()
//             );

//             if (photo) {
//               const ext = path.extname(photo.originalname);
//               const newFilename = `${studentIdFromExcel}${ext}`;
//               const newPath = path.join(DEEPFACE_PHOTOS_DIR, newFilename);

//               // Move file from temp-photos → student-photos
//               fs.renameSync(photo.path, newPath);

//               finalImagePath = newPath;
//               console.log(`✅ Photo saved for ${studentIdFromExcel} → ${newPath}`);
//             } else {
//               console.warn(`⚠️ No photo found for ${studentIdFromExcel}`);
//             }
//           }

//           // Create student in DB
//           const newStudent = new User({
//             userId: studentIdFromExcel,
//             password: studentData.password || '123456',
//             role: 'student',
//             name: studentData.name,
//             email: studentData.email,
//             phone: studentData.phone,
//             department: studentData.department,
//             year: studentData.year,
//             section: studentData.section,
//             semester: studentData.semester,
//             rollNumber: studentData.rollNumber,
//             profileImage: finalImagePath
//           });

//           await newStudent.save();
//           createdStudents.push(newStudent);

//         } catch (error) {
//           errors.push({
//             row: i + 2,
//             student: studentData.name || 'N/A',
//             error: error.message
//           });
//         }
//       }

//       // Clean up only Excel file (photos already moved)
//       if (req.files.excel) {
//         fs.unlinkSync(req.files.excel[0].path);
//       }

//       res.json({
//         message: `${createdStudents.length} students created successfully.`,
//         errors: errors.length > 0 ? errors : undefined
//       });
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ message: 'Server error' });
//     }
//   }
// );


// router.post('/upload-teachers', [auth, adminAuth, upload.single('excel')], async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'Excel file is required' });
//     }

//     const workbook = XLSX.readFile(req.file.path);
//     const worksheet = workbook.Sheets[workbook.SheetNames[0]];
//     const teachers = XLSX.utils.sheet_to_json(worksheet);

//     const createdTeachers = [];
//     const errors = [];

//     for (let i = 0; i < teachers.length; i++) {
//       const teacher = teachers[i];
//       try {
//         const newTeacher = new User({
//           userId: teacher.employeeId,
//           password: teacher.password || '123456',
//           role: 'teacher',
//           name: teacher.name,
//           email: teacher.email,
//           phone: teacher.phone,
//           subjectsHandled: teacher.subjects ? teacher.subjects.split(',') : [],
//           departmentAssigned: teacher.departments ? teacher.departments.split(',') : []
//         });

//         await newTeacher.save();
//         createdTeachers.push(newTeacher);
//       } catch (error) {
//         errors.push({ row: i + 1, error: error.message });
//       }
//     }

//     res.json({
//       message: `${createdTeachers.length} teachers created successfully`,
//       errors: errors.length > 0 ? errors : undefined
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.post('/departments', [auth, adminAuth], async (req, res) => {
//   try {
//     const { name, code, hodId, years } = req.body;

//     const department = new Department({
//       name,
//       code,
//       hod: hodId,
//       years
//     });

//     await department.save();
//     res.json({ message: 'Department created successfully', department });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.get('/departments', [auth, adminAuth], async (req, res) => {
//   try {
//     const departments = await Department.find().populate('hod', 'name');
//     res.json(departments);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// router.post('/timetable', [auth, adminAuth, upload.single('excel')], async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: 'Excel file is required' });
//     }

//     const workbook = XLSX.readFile(req.file.path);
//     const worksheet = workbook.Sheets[workbook.SheetNames[0]];
//     const timetableData = XLSX.utils.sheet_to_json(worksheet);

//     console.log('📊 Raw timetable data:', timetableData); // Debug log

//     const processedTimetables = new Map();

//     // Helper to safely format values
//     const safeTrim = (value) => {
//       if (value === null || value === undefined) return '';
//       return value.toString().trim();
//     };

//     // Helper to format time safely
//     const formatTime = (t) => {
//       if (!t) return '';
//       if (typeof t === 'number') { // Excel time as number
//         const date = new Date((t - 25569) * 86400 * 1000);
//         return date.toISOString().substr(11, 5); // HH:mm
//       }
//       return safeTrim(t);
//     };

//     for (const row of timetableData) {
//       // Safely get values with defaults
//       const department = safeTrim(row.department);
//       const year = parseInt(row.year) || 1;
//       const section = safeTrim(row.section) || 'A';
//       const semester = parseInt(row.semester) || 1;
//       const academicYear = safeTrim(row.academicYear) || '2023-24';
//       const day = safeTrim(row.day);
//       const subject = safeTrim(row.subject);
//       const subjectCode = safeTrim(row.subjectCode);
//       const teacher = safeTrim(row.teacher);
//       const type = safeTrim(row.type) || 'theory';
//       const room = safeTrim(row.room) || '';

//       // Skip rows with missing essential data
//       if (!department || !day || !subject || !teacher) {
//         console.warn('⚠️ Skipping row with missing essential data:', row);
//         continue;
//       }

//       const key = `${department}-${year}-${section}-${semester}`;

//       if (!processedTimetables.has(key)) {
//         processedTimetables.set(key, {
//           department,
//           year,
//           section,
//           semester,
//           academicYear,
//           schedule: []
//         });
//       }

//       const timetable = processedTimetables.get(key);

//       // Find or create day schedule
//       let daySchedule = timetable.schedule.find(s => 
//         s.day.toLowerCase() === day.toLowerCase()
//       );
//       if (!daySchedule) {
//         daySchedule = { day, slots: [] };
//         timetable.schedule.push(daySchedule);
//       }

//       // Lookup teacher by userId (more reliable than name)
//       const teacherDoc = await User.findOne({
//         userId: teacher, // Use userId from Excel (CS001, CS002, etc.)
//         role: 'teacher'
//       });

//       if (!teacherDoc) {
//         console.warn(`⚠️ Teacher not found: ${teacher}. Row:`, row);
//         // Continue without teacher assignment
//       }

//       const slot = {
//         startTime: formatTime(row.startTime),
//         endTime: formatTime(row.endTime),
//         subject,
//         subjectCode,
//         teacher: teacherDoc ? teacherDoc._id : null,
//         type,
//         room
//       };

//       // Validate time format
//       if (!slot.startTime || !slot.endTime) {
//         console.warn('⚠️ Skipping slot with invalid time format:', slot);
//         continue;
//       }

//       daySchedule.slots.push(slot);
//     }

//     // Check if any timetables were processed
//     if (processedTimetables.size === 0) {
//       return res.status(400).json({ 
//         message: 'No valid timetable data found. Check Excel format.' 
//       });
//     }

//     const savedTimetables = [];
//     for (const [key, timetableData] of processedTimetables) {
//       // Remove old timetable for same department/year/section/semester
//       await Timetable.deleteMany({
//         department: timetableData.department,
//         year: timetableData.year,
//         section: timetableData.section,
//         semester: timetableData.semester
//       });

//       const timetable = new Timetable(timetableData);
//       await timetable.save();
//       savedTimetables.push(timetable);
//     }

//     // Clean up uploaded file
//     fs.unlinkSync(req.file.path);

//     res.json({
//       message: `${savedTimetables.length} timetables created successfully`,
//       timetables: savedTimetables
//     });

//   } catch (error) {
//     console.error('❌ Timetable upload error:', error);
    
//     // Clean up file on error
//     if (req.file && fs.existsSync(req.file.path)) {
//       fs.unlinkSync(req.file.path);
//     }
    
//     res.status(500).json({ 
//       message: 'Server error during timetable upload',
//       error: error.message 
//     });
//   }
// });

// router.get('/analytics', [auth, adminAuth], async (req, res) => {
//   try {
//     const { startDate, endDate, department, year, section } = req.query;
    
//     let matchQuery = {};
//     if (startDate && endDate) {
//       matchQuery.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }
//     if (department) matchQuery.department = department;
//     if (year) matchQuery.year = parseInt(year);
//     if (section) matchQuery.section = section;

//     const overallStats = await Attendance.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: null,
//           totalClasses: { $sum: 1 },
//           avgAttendance: { $avg: '$attendancePercentage' },
//           totalPresent: { $sum: '$presentCount' },
//           totalStudents: { $sum: '$totalStudents' }
//         }
//       }
//     ]);

//     const deptBreakdown = await Attendance.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: '$department',
//           avgAttendance: { $avg: '$attendancePercentage' },
//           totalClasses: { $sum: 1 }
//         }
//       },
//       { $sort: { avgAttendance: -1 } }
//     ]);

//     const subjectBreakdown = await Attendance.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: { subject: '$subject', department: '$department' },
//           avgAttendance: { $avg: '$attendancePercentage' },
//           totalClasses: { $sum: 1 }
//         }
//       },
//       { $sort: { avgAttendance: -1 } }
//     ]);

//     const dailyTrend = await Attendance.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: {
//             year: { $year: '$date' },
//             month: { $month: '$date' },
//             day: { $dayOfMonth: '$date' }
//           },
//           avgAttendance: { $avg: '$attendancePercentage' },
//           totalClasses: { $sum: 1 }
//         }
//       },
//       { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
//     ]);

//     res.json({
//       overallStats: overallStats[0] || {},
//       deptBreakdown,
//       subjectBreakdown,
//       dailyTrend
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });


// // Assign HOD to Department
// router.put('/departments/:deptId/hod', [auth, adminAuth], async (req, res) => {
//   try {
//     const { teacherId } = req.body;
    
//     // Verify teacher exists
//     const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
//     if (!teacher) {
//       return res.status(400).json({ message: 'Teacher not found' });
//     }

//     // Remove HOD from any other department
//     await Department.updateMany(
//       { hod: teacherId },
//       { $unset: { hod: 1 } }
//     );

//     // Update teacher as HOD
//     await User.findByIdAndUpdate(teacherId, {
//       isHod: true,
//       hodOfDepartment: req.params.deptId
//     });

//     const department = await Department.findByIdAndUpdate(
//       req.params.deptId,
//       { hod: teacherId },
//       { new: true }
//     ).populate('hod', 'name email userId');

//     if (!department) {
//       return res.status(404).json({ message: 'Department not found' });
//     }

//     res.json({ 
//       message: 'HOD assigned successfully', 
//       department 
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Remove HOD from Department
// router.delete('/departments/:deptId/hod', [auth, adminAuth], async (req, res) => {
//   try {
//     const department = await Department.findById(req.params.deptId);
    
//     if (!department) {
//       return res.status(404).json({ message: 'Department not found' });
//     }

//     if (department.hod) {
//       // Remove HOD status from teacher
//       await User.findByIdAndUpdate(department.hod, {
//         isHod: false,
//         $unset: { hodOfDepartment: 1 }
//       });

//       // Remove HOD from department
//       department.hod = undefined;
//       await department.save();
//     }

//     res.json({ message: 'HOD removed successfully' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Get All HODs
// router.get('/hods', [auth, adminAuth], async (req, res) => {
//   try {
//     const hods = await Department.find({ hod: { $exists: true } })
//       .populate('hod', 'name email userId')
//       .select('name code hod');

//     res.json(hods);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;
















const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const User = require('../model/User');
const Department = require('../model/Department');
const Timetable = require('../model/Timetable');
const Attendance = require('../model/Attendance');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();
const DEEPFACE_PHOTOS_DIR = path.join(__dirname, '..', 'deepface_service', 'uploads', 'student-photos');

// Ensure the directory exists
if (!fs.existsSync(DEEPFACE_PHOTOS_DIR)) {
  fs.mkdirSync(DEEPFACE_PHOTOS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'photos') {
      cb(null, 'uploads/temp-photos'); // temp folder
    } else {
      cb(null, 'uploads/'); // excel and other files
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // keep original name (important for matching!)
  }
});




const upload = multer({ storage });

router.get('/dashboard', [auth, adminAuth], async (req, res) => {
    try {
        // --- 1. Basic Counts (Updated on Uploads) ---
        const totalStudents = await User.countDocuments({ role: 'student', isActive: true });
        const totalTeachers = await User.countDocuments({ role: 'teacher', isActive: true });
        const totalDepartments = await Department.countDocuments();

        // --- 2. Today's Attendance (Updated on Teacher Attendance Marking) ---
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const todayAttendance = await Attendance.aggregate([
            { 
                $match: { 
                    date: { $gte: todayStart, $lt: todayEnd } 
                } 
            },
            {
                $group: {
                    _id: null,
                    totalPresent: { $sum: '$presentCount' },
                    totalAbsent: { $sum: '$absentCount' },
                    totalClasses: { $sum: 1 },
                    avgAttendance: { $avg: '$attendancePercentage' }
                }
            }
        ]);

        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
        const totalClassesToday = await Timetable.aggregate([
            { $unwind: '$schedule' },
            { $unwind: '$schedule.slots' },
            { $match: { 'schedule.day': dayName } },
            { $group: { _id: null, totalClasses: { $sum: 1 } } }
        ]);

        // --- 3. Department-wise Performance (Normalized and Updated by Attendance) ---
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const deptAttendance = await Attendance.aggregate([
            { 
                $match: { 
                    date: { $gte: thirtyDaysAgo } 
                } 
            },
            // Normalize Department Name to handle inconsistent inputs ("CS" vs "CS")
            {
                $project: {
                    normalizedDepartment: { $toUpper: { $trim: { input: "$department" } } },
                    presentCount: 1,
                    totalStudents: 1,
                    attendancePercentage: 1,
                    date: 1
                }
            },
            {
                $group: {
                    _id: '$normalizedDepartment', 
                    avgAttendance: { $avg: '$attendancePercentage' },
                    totalClasses: { $sum: 1 },
                    totalPresent: { $sum: '$presentCount' },
                    totalStudentsTracked: { $sum: '$totalStudents' } // Sum of student counts AT TIME of attendance
                }
            },
            { $sort: { avgAttendance: -1 } }
        ]);

        // --- 4. Get Current Student Count per Department (Updated on Student Upload) ---
        // This is crucial for showing the *actual* student strength
        const deptStudentCounts = await User.aggregate([
            { $match: { role: 'student', isActive: true, department: { $exists: true, $ne: null } } },
            // Normalize the department field for matching against deptAttendance
            {
                $project: {
                    normalizedDepartment: { $toUpper: { $trim: { input: "$department" } } },
                    _id: 0
                }
            },
            { $group: { _id: '$normalizedDepartment', actualStudentCount: { $sum: 1 } } }
        ]);

        // Merge attendance data with actual student counts
        const mergedDeptBreakdown = deptAttendance.map(dept => {
            const actualCount = deptStudentCounts.find(d => d._id === dept._id);
            return {
                department: dept._id,
                avgAttendance: Math.round(dept.avgAttendance || 0),
                totalClasses: dept.totalClasses,
                totalPresent: dept.totalPresent,
                // Use the count from the User collection for the most up-to-date total
                totalStudents: actualCount ? actualCount.actualStudentCount : 0 
            };
        });

        // --- 5. Recent Activity ---
        const recentActivity = await Attendance.find({})
            .populate('teacher', 'name')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('subject teacher date presentCount totalStudents')
            .lean();

        const formattedActivity = recentActivity.map(activity => ({
            type: 'attendance_marked',
            teacher: activity.teacher?.name || 'Unknown',
            subject: activity.subject,
            present: activity.presentCount,
            total: activity.totalStudents,
            percentage: Math.round((activity.presentCount / activity.totalStudents) * 100),
            time: activity.date
        }));


        // --- Prepare Final Response ---
        const todayStats = todayAttendance[0] || { 
            totalPresent: 0, 
            totalAbsent: 0, 
            totalClasses: 0, 
            avgAttendance: 0 
        };
        const classesToday = totalClassesToday[0] || { totalClasses: 0 };

        res.json({
            stats: {
                totalStudents,
                totalTeachers,
                totalDepartments,
                totalClassesToday: classesToday.totalClasses,
                todayAttendance: {
                    totalPresent: todayStats.totalPresent,
                    totalAbsent: todayStats.totalAbsent,
                    totalClasses: todayStats.totalClasses,
                    avgAttendance: Math.round(todayStats.avgAttendance || 0)
                }
            },
            deptAttendance: mergedDeptBreakdown, // Use the merged, normalized data
            recentActivity: formattedActivity,
            lastUpdated: new Date()
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
// ========================
// SYSTEM TIME HELPERS
// ========================
const getCurrentTime = () => {
  const now = new Date();
  return now.toTimeString().slice(0, 5); // Returns "14:30" format
};

const getCurrentDay = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
};

const calculateTimeDifference = (currentTime, targetTime) => {
  const [currentHours, currentMinutes] = currentTime.split(':').map(Number);
  const [targetHours, targetMinutes] = targetTime.split(':').map(Number);
  
  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  const targetTotalMinutes = targetHours * 60 + targetMinutes;
  
  return targetTotalMinutes - currentTotalMinutes;
};

router.post(
  '/upload-students',
  [auth, adminAuth, upload.fields([
    { name: 'excel', maxCount: 1 },
    { name: 'photos', maxCount: 100 }
  ])],
  async (req, res) => {
    try {
      if (!req.files.excel) {
        return res.status(400).json({ message: 'Excel file is required' });
      }

      // Read Excel
      const workbook = XLSX.readFile(req.files.excel[0].path);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const students = XLSX.utils.sheet_to_json(worksheet);

      const createdStudents = [];
      const errors = [];

      for (let i = 0; i < students.length; i++) {
        const studentData = students[i];
        try {
          let finalImagePath = '';

          // Unique identifier from Excel
          const studentIdFromExcel = studentData.userId || studentData.rollNumber;
          if (!studentIdFromExcel) {
            throw new Error("Row in Excel is missing 'userId' or 'rollNumber'.");
          }

          if (req.files.photos) {
            // Find photo matching Excel ID
            const photo = req.files.photos.find(file =>
              path.parse(file.originalname).name.toLowerCase() === studentIdFromExcel.toString().toLowerCase()
            );

            if (photo) {
              const ext = path.extname(photo.originalname);
              const newFilename = `${studentIdFromExcel}${ext}`;
              const newPath = path.join(DEEPFACE_PHOTOS_DIR, newFilename);

              // Move file from temp-photos → student-photos
              fs.renameSync(photo.path, newPath);

              finalImagePath = newPath;
              console.log(`✅ Photo saved for ${studentIdFromExcel} → ${newPath}`);
            } else {
              console.warn(`⚠️ No photo found for ${studentIdFromExcel}`);
            }
          }

          // Create student in DB
          const newStudent = new User({
            userId: studentIdFromExcel,
            password: studentData.password || '123456',
            role: 'student',
            name: studentData.name,
            email: studentData.email,
            phone: studentData.phone,
            department: studentData.department,
            year: studentData.year,
            section: studentData.section,
            semester: studentData.semester,
            rollNumber: studentData.rollNumber,
            profileImage: finalImagePath
          });

          await newStudent.save();
          createdStudents.push(newStudent);

        } catch (error) {
          errors.push({
            row: i + 2,
            student: studentData.name || 'N/A',
            error: error.message
          });
        }
      }

      // Clean up only Excel file (photos already moved)
      if (req.files.excel) {
        fs.unlinkSync(req.files.excel[0].path);
      }

      res.json({
        message: `${createdStudents.length} students created successfully.`,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ========================
// SYSTEM TIME TEST ROUTE
// ========================
router.get('/system-time', (req, res) => {
  const now = new Date();
  res.json({
    systemTime: now.toISOString(),
    formattedTime: now.toTimeString(),
    timeHHMM: now.toTimeString().slice(0, 5),
    currentDay: getCurrentDay(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: now.getTime()
  });
});


router.post('/upload-teachers', [auth, adminAuth, upload.single('excel')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file is required' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const teachers = XLSX.utils.sheet_to_json(worksheet);

    const createdTeachers = [];
    const errors = [];

    for (let i = 0; i < teachers.length; i++) {
      const teacher = teachers[i];
      try {
        const newTeacher = new User({
          userId: teacher.employeeId,
          password: teacher.password || '123456',
          role: 'teacher',
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone,
          subjectsHandled: teacher.subjects ? teacher.subjects.split(',') : [],
          departmentAssigned: teacher.departments ? teacher.departments.split(',') : []
        });

        await newTeacher.save();
        createdTeachers.push(newTeacher);
      } catch (error) {
        errors.push({ row: i + 1, error: error.message });
      }
    }

    res.json({
      message: `${createdTeachers.length} teachers created successfully`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
// ========================
// UPLOAD HODs (NEW SEPARATE ROUTE)
// ========================
router.post('/upload-hods', [auth, adminAuth, upload.single('excel')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file is required' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const hods = XLSX.utils.sheet_to_json(worksheet);

    const createdHods = [];
    const errors = [];

    for (let i = 0; i < hods.length; i++) {
      const hodData = hods[i];
      try {
        // Check if department exists
        const department = await Department.findOne({ code: hodData.department });
        if (!department) {
          throw new Error(`Department ${hodData.department} not found. Create department first.`);
        }

        // Check if HOD already exists for this department
        const existingHod = await User.findOne({ 
          hodOfDepartment: hodData.department, 
          isHod: true 
        });
        if (existingHod) {
          throw new Error(`Department ${hodData.department} already has HOD: ${existingHod.name}`);
        }

        // Create HOD user
        const newHod = new User({
          userId: hodData.employeeId,
          password: hodData.password || '123456',
          role: 'teacher',
          name: hodData.name,
          email: hodData.email,
          phone: hodData.phone || '',
          departmentAssigned: [hodData.department],
          subjectsHandled: ['Department Management'], // Default subject for HODs
          isHod: true,
          hodOfDepartment: hodData.department
        });

        await newHod.save();

        // Update department with HOD reference
        department.hod = newHod._id;
        await department.save();

        createdHods.push(newHod);
        console.log(`✅ HOD created and assigned: ${newHod.name} for ${hodData.department}`);

      } catch (error) {
        errors.push({
          row: i + 2,
          hod: hodData.name || 'N/A',
          error: error.message
        });
      }
    }

    // Clean up file
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      message: `${createdHods.length} HODs created and assigned successfully`,
      createdHods: createdHods.map(hod => ({
        userId: hod.userId,
        name: hod.name,
        department: hod.hodOfDepartment,
        email: hod.email
      })),
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Upload HODs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/departments', [auth, adminAuth], async (req, res) => {
  try {
    const { name, code, hodId, years } = req.body;

    const department = new Department({
      name,
      code,
      hod: hodId,
      years
    });

    await department.save();
    res.json({ message: 'Department created successfully', department });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/departments', [auth, adminAuth], async (req, res) => {
  try {
    const departments = await Department.find().populate('hod', 'name');
    res.json(departments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/timetable', [auth, adminAuth, upload.single('excel')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file is required' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const timetableData = XLSX.utils.sheet_to_json(worksheet);

    console.log('📊 Raw timetable data:', timetableData); // Debug log

    const processedTimetables = new Map();

    // Helper to safely format values
    const safeTrim = (value) => {
      if (value === null || value === undefined) return '';
      return value.toString().trim();
    };

    // Helper to format time safely
    const formatTime = (t) => {
      if (!t) return '';
      if (typeof t === 'number') { // Excel time as number
        const date = new Date((t - 25569) * 86400 * 1000);
        return date.toISOString().substr(11, 5); // HH:mm
      }
      return safeTrim(t);
    };

    for (const row of timetableData) {
      // Safely get values with defaults
      const department = safeTrim(row.department);
      const year = parseInt(row.year) || 1;
      const section = safeTrim(row.section) || 'A';
      const semester = parseInt(row.semester) || 1;
      const academicYear = safeTrim(row.academicYear) || '2023-24';
      const day = safeTrim(row.day);
      const subject = safeTrim(row.subject);
      const subjectCode = safeTrim(row.subjectCode);
      const teacher = safeTrim(row.teacher);
      const type = safeTrim(row.type) || 'theory';
      const room = safeTrim(row.room) || '';

      // Skip rows with missing essential data
      if (!department || !day || !subject || !teacher) {
        console.warn('⚠️ Skipping row with missing essential data:', row);
        continue;
      }

      const key = `${department}-${year}-${section}-${semester}`;

      if (!processedTimetables.has(key)) {
        processedTimetables.set(key, {
          department,
          year,
          section,
          semester,
          academicYear,
          schedule: []
        });
      }

      const timetable = processedTimetables.get(key);

      // Find or create day schedule
      let daySchedule = timetable.schedule.find(s => 
        s.day.toLowerCase() === day.toLowerCase()
      );
      if (!daySchedule) {
        daySchedule = { day, slots: [] };
        timetable.schedule.push(daySchedule);
      }

      // Lookup teacher by userId (more reliable than name)
      const teacherDoc = await User.findOne({
        userId: teacher, // Use userId from Excel (CS001, CS002, etc.)
        role: 'teacher'
      });

      if (!teacherDoc) {
        console.warn(`⚠️ Teacher not found: ${teacher}. Row:`, row);
        // Continue without teacher assignment
      }

      const slot = {
        startTime: formatTime(row.startTime),
        endTime: formatTime(row.endTime),
        subject,
        subjectCode,
        teacher: teacherDoc ? teacherDoc._id : null,
        type,
        room
      };

      // Validate time format
      if (!slot.startTime || !slot.endTime) {
        console.warn('⚠️ Skipping slot with invalid time format:', slot);
        continue;
      }

      daySchedule.slots.push(slot);
    }

    // Check if any timetables were processed
    if (processedTimetables.size === 0) {
      return res.status(400).json({ 
        message: 'No valid timetable data found. Check Excel format.' 
      });
    }

    const savedTimetables = [];
    for (const [key, timetableData] of processedTimetables) {
      // Remove old timetable for same department/year/section/semester
      await Timetable.deleteMany({
        department: timetableData.department,
        year: timetableData.year,
        section: timetableData.section,
        semester: timetableData.semester
      });

      const timetable = new Timetable(timetableData);
      await timetable.save();
      savedTimetables.push(timetable);
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: `${savedTimetables.length} timetables created successfully`,
      timetables: savedTimetables
    });

  } catch (error) {
    console.error('❌ Timetable upload error:', error);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      message: 'Server error during timetable upload',
      error: error.message 
    });
  }
});

router.get('/analytics', [auth, adminAuth], async (req, res) => {
  try {
    const { startDate, endDate, department, year, section } = req.query;
    
    let matchQuery = {};
    if (startDate && endDate) {
      matchQuery.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (department) matchQuery.department = department;
    if (year) matchQuery.year = parseInt(year);
    if (section) matchQuery.section = section;

    // ✅ SOURCE OF TRUTH: Actual counts from uploaded data
    let studentCountQuery = { role: 'student', isActive: true };
    let teacherCountQuery = { role: 'teacher', isActive: true };
    
    if (department) {
      studentCountQuery.department = department;
      teacherCountQuery.departmentAssigned = department;
    }
    if (year) studentCountQuery.year = parseInt(year);
    if (section) studentCountQuery.section = section;

    const totalStudents = await User.countDocuments(studentCountQuery);
    const totalTeachers = await User.countDocuments(teacherCountQuery);
    const totalDepartments = await Department.countDocuments();

    // ✅ REAL-TIME: Attendance analytics (updated when teacher marks attendance)
    const overallStats = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalClasses: { $sum: 1 },
          avgAttendance: { $avg: '$attendancePercentage' },
          totalPresent: { $sum: '$presentCount' },
          totalStudentsInAttendance: { $sum: '$totalStudents' }
        }
      }
    ]);

    const deptBreakdown = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$department',
          avgAttendance: { $avg: '$attendancePercentage' },
          totalClasses: { $sum: 1 },
          totalPresent: { $sum: '$presentCount' },
          totalStudentsInAttendance: { $sum: '$totalStudents' }
        }
      },
      { $sort: { avgAttendance: -1 } }
    ]);

    // ✅ GET ACTUAL STUDENT COUNTS PER DEPARTMENT
    const deptStudentCounts = await User.aggregate([
      { 
        $match: { 
          role: 'student', 
          isActive: true,
          department: { $exists: true, $ne: null }
        } 
      },
      {
        $group: {
          _id: '$department',
          actualStudentCount: { $sum: 1 }
        }
      }
    ]);

    // Merge attendance data with actual student counts
    const mergedDeptBreakdown = deptBreakdown.map(dept => {
      const actualCount = deptStudentCounts.find(d => d._id === dept._id);
      return {
        department: dept._id,
        avgAttendance: Math.round(dept.avgAttendance || 0),
        totalClasses: dept.totalClasses,
        totalPresent: dept.totalPresent,
        totalStudentsInAttendance: dept.totalStudentsInAttendance,
        actualStudentCount: actualCount ? actualCount.actualStudentCount : 0  // ✅ Actual count
      };
    });

    const subjectBreakdown = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { subject: '$subject', department: '$department' },
          avgAttendance: { $avg: '$attendancePercentage' },
          totalClasses: { $sum: 1 },
          totalPresent: { $sum: '$presentCount' }
        }
      },
      { $sort: { avgAttendance: -1 } }
    ]);

    const dailyTrend = await Attendance.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            day: { $dayOfMonth: '$date' }
          },
          avgAttendance: { $avg: '$attendancePercentage' },
          totalClasses: { $sum: 1 },
          totalPresent: { $sum: '$presentCount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const stats = overallStats[0] || { 
      totalClasses: 0, 
      avgAttendance: 0, 
      totalPresent: 0, 
      totalStudentsInAttendance: 0 
    };

    res.json({
      // ✅ FROM UPLOADED DATA
      overallStats: {
        totalStudents: totalStudents,           // ✅ Actual student count from uploads
        totalTeachers: totalTeachers,           // ✅ Actual teacher count from uploads
        totalDepartments: totalDepartments,     // ✅ Actual department count
        
        // ✅ REAL-TIME UPDATES (from teacher attendance)
        totalClasses: stats.totalClasses,
        avgAttendance: Math.round(stats.avgAttendance || 0),
        totalPresent: stats.totalPresent,
        totalStudentsInAttendance: stats.totalStudentsInAttendance
      },
      deptBreakdown: mergedDeptBreakdown,       // ✅ Includes actual student counts
      subjectBreakdown: subjectBreakdown.map(subj => ({
        subject: subj._id.subject,
        department: subj._id.department,
        avgAttendance: Math.round(subj.avgAttendance || 0),
        totalClasses: subj.totalClasses,
        totalPresent: subj.totalPresent
      })),
      dailyTrend: dailyTrend.map(day => ({
        date: `${day._id.year}-${day._id.month}-${day._id.day}`,
        avgAttendance: Math.round(day.avgAttendance || 0),
        totalClasses: day.totalClasses,
        totalPresent: day.totalPresent
      })),
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign HOD to Department
router.put('/departments/:deptId/hod', [auth, adminAuth], async (req, res) => {
  try {
    const { teacherId } = req.body;
    
    // Verify teacher exists
    const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });
    if (!teacher) {
      return res.status(400).json({ message: 'Teacher not found' });
    }

    // Remove HOD from any other department
    await Department.updateMany(
      { hod: teacherId },
      { $unset: { hod: 1 } }
    );

    // Update teacher as HOD
    await User.findByIdAndUpdate(teacherId, {
      isHod: true,
      hodOfDepartment: req.params.deptId
    });

    const department = await Department.findByIdAndUpdate(
      req.params.deptId,
      { hod: teacherId },
      { new: true }
    ).populate('hod', 'name email userId');

    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    res.json({ 
      message: 'HOD assigned successfully', 
      department 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove HOD from Department
router.delete('/departments/:deptId/hod', [auth, adminAuth], async (req, res) => {
  try {
    const department = await Department.findById(req.params.deptId);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    if (department.hod) {
      // Remove HOD status from teacher
      await User.findByIdAndUpdate(department.hod, {
        isHod: false,
        $unset: { hodOfDepartment: 1 }
      });

      // Remove HOD from department
      department.hod = undefined;
      await department.save();
    }

    res.json({ message: 'HOD removed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get All HODs
router.get('/hods', [auth, adminAuth], async (req, res) => {
  try {
    const hods = await Department.find({ hod: { $exists: true } })
      .populate('hod', 'name email userId')
      .select('name code hod');

    res.json(hods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});



module.exports = router;











