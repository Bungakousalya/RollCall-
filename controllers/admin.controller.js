const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const User = require("../models/User.model");
const Timetable = require("../models/Timetable.model");
const Teacher = require("../models/Teacher.model");
const Attendance = require("../models/Attendance.model");
const bcrypt = require("bcryptjs");

// ---------------- Dashboard ----------------
exports.getDashboard = async (req, res) => {
  try {
    const total_students = await User.countDocuments({ role: "student" });
    const total_teachers = await Teacher.countDocuments();
    res.json({ total_students, total_teachers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------- Student CRUD ----------------
exports.createStudent = async (req, res) => {
  try {
    const { name, email, password, department, year, section } = req.body;
    if (!req.file) return res.status(400).json({ msg: "Student photo is required" });

    const photo = req.file.filename;
    let existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: "Student already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const student = new User({
      name,
      email,
      password: hashedPassword,
      role: "student",
      studentDetails: { department, year, section, photo },
    });

    await student.save();
    res.status(201).json({ msg: "Student created successfully", student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findByIdAndDelete(studentId);
    if (!student) return res.status(404).json({ msg: "Student not found" });
    res.json({ msg: "Student deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// ---------------- Teacher CRUD ----------------
exports.addTeacher = async (req, res) => {
  try {
    const { name, email, password, department, subjectsHandled } = req.body;
    let existing = await Teacher.findOne({ email });
    if (existing) return res.status(400).json({ msg: "Teacher already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const teacher = new Teacher({ name, email, password: hashedPassword, department, subjectsHandled });
    await teacher.save();
    res.status(201).json({ msg: "Teacher added successfully", teacher });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find().select("-password");
    res.json({ teachers });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    await Teacher.findByIdAndDelete(teacherId);
    res.json({ msg: "Teacher deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

// ---------------- Upload Timetable Excel ----------------
exports.uploadTimetableExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Excel file is required" });

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const timetableMap = {};

    for (const row of rows) {
      const { department, year, section, semester, day, startTime, endTime, subject, teacherEmail, type } = row;
      const teacher = await Teacher.findOne({ email: teacherEmail });
      if (!teacher) continue;

      const key = `${department}-${year}-${section}-${semester}`;
      if (!timetableMap[key]) timetableMap[key] = { department, year, section, semester, days: {} };
      if (!timetableMap[key].days[day]) timetableMap[key].days[day] = [];

      timetableMap[key].days[day].push({ startTime, endTime, subject, type, teacher: teacher._id });
    }

    for (const key in timetableMap) {
      const { department, year, section, semester, days } = timetableMap[key];
      const daysArray = Object.keys(days).map(day => {
        const slots = days[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
        const freePeriods = [];
        const collegeHours = [
          { start: "09:00", end: "09:45" },
          { start: "10:00", end: "10:45" },
          { start: "11:00", end: "11:45" },
          { start: "12:00", end: "12:45" },
          { start: "02:00", end: "02:45" },
          { start: "03:00", end: "03:45" },
          { start: "04:00", end: "04:45" }
        ];

        for (const period of collegeHours) {
          const occupied = slots.some(s => s.startTime === period.start && s.endTime === period.end);
          if (!occupied) freePeriods.push(`${period.start}-${period.end}`);
        }

        return { day, slots, freePeriods };
      });

      await Timetable.findOneAndUpdate(
        { department, year, section, semester },
        { days: daysArray },
        { upsert: true, new: true }
      );
    }

    res.json({ message: "Timetable uploaded successfully with free periods" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error processing timetable" });
  }
};



// ---------------- College Attendance ----------------
exports.getCollegeAttendance = async (req, res) => {
  try {
    const totalRecords = await Attendance.countDocuments();
    const presentRecords = await Attendance.countDocuments({ status: "present" });
    const collegeAttendance = totalRecords ? ((presentRecords / totalRecords) * 100).toFixed(2) : "0";
    res.json({ collegeAttendance: collegeAttendance + "%" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------- Department Attendance ----------------
exports.getDepartmentAttendance = async (req, res) => {
  try {
    const departmentWise = await Attendance.aggregate([
      { $lookup: { from: "users", localField: "student", foreignField: "_id", as: "student" } },
      { $unwind: "$student" },
      { $group: { 
          _id: "$student.studentDetails.department", 
          total: { $sum: 1 }, 
          present: { $sum: { $cond: [{ $eq: ["$status","present"]},1,0] } } 
      }},
      { $project: { 
          department: "$_id", 
          attendancePercentage: { 
            $cond:[{ $eq:["$total",0]},0,{ $multiply:[{ $divide:["$present","$total"]},100] }] 
          } 
      }}
    ]);
    res.json({ departmentWise });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------- Class Attendance ----------------
exports.getClassAttendance = async (req, res) => {
  try {
    const classWise = await Attendance.aggregate([
      { $lookup: { from: "users", localField: "student", foreignField: "_id", as: "student" } },
      { $unwind: "$student" },
      { $group: { 
          _id: { 
            department: "$student.studentDetails.department", 
            year: "$student.studentDetails.year", 
            section: "$student.studentDetails.section", 
            semester: "$student.studentDetails.semester" 
          },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } }
      }},
      { $project: { 
          department: "$_id.department",
          year: "$_id.year",
          section: "$_id.section",
          semester: "$_id.semester",
          attendancePercentage: { 
            $cond:[{ $eq:["$total",0]},0,{ $multiply:[{ $divide:["$present","$total"]},100] }] 
          } 
      }}
    ]);
    res.json({ classWise });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------- Year + Section Attendance ----------------
exports.getYearSectionAttendance = async (req, res) => {
  try {
    const yearSectionWise = await Attendance.aggregate([
      { $lookup: { from: "users", localField: "student", foreignField: "_id", as: "student" } },
      { $unwind: "$student" },
      { $group: {
          _id: { department: "$student.studentDetails.department", year: "$student.studentDetails.year", section: "$student.studentDetails.section" },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status","present"]},1,0] } }
      }},
      { $project: {
          department: "$_id.department",
          year: "$_id.year",
          section: "$_id.section",
          attendancePercentage: { $cond:[{ $eq:["$total",0]},0,{ $multiply:[{ $divide:["$present","$total"]},100] }] }
      }}
    ]);
    res.json({ yearSectionWise });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------- Student Attendance ----------------
exports.getStudentAttendance = async (req, res) => {
  try {
    const students = await User.find({ role: "student" });
    const studentDetails = [];

    for (const student of students) {
      const attendance = await Attendance.find({ student: student._id });
      const subjectWise = {};
      let total = 0, present = 0;

      attendance.forEach(record => {
        const subject = record.slot?.subject || "Unknown";
        if (!subjectWise[subject]) subjectWise[subject] = { total: 0, present: 0 };
        subjectWise[subject].total++;
        total++;
        if (record.status === "present") {
          subjectWise[subject].present++;
          present++;
        }
      });

      const subjectWisePercentages = {};
      for (const subject in subjectWise) {
        subjectWisePercentages[subject] = ((subjectWise[subject].present / subjectWise[subject].total) * 100).toFixed(2);
      }

      studentDetails.push({
        studentId: student._id,
        name: student.name,
        department: student.studentDetails.department,
        year: student.studentDetails.year,
        section: student.studentDetails.section,
        overall: total > 0 ? ((present / total) * 100).toFixed(2) : "0",
        subjectWise: subjectWisePercentages
      });
    }

    res.json({ students: studentDetails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
