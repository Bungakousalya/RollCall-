// controllers/attendance.controller.js
const Attendance = require("../models/Attendance.model");
const User = require("../models/User.model");
const Timetable = require("../models/Timetable.model");

// ------------------- Unified Attendance Controller -------------------

// 1️⃣ Mark attendance (manual or auto)
exports.markAttendance = async ({ timetableId, attendanceData }) => {
  try {
    const promises = attendanceData.map(async (entry) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await Attendance.findOne({
        timetable: timetableId,
        student: entry.student,
        date: today,
      });

      if (existing) {
        existing.status = entry.status;
        existing.autoMarked = entry.autoMarked ?? true;
        return existing.save();
      }

      return Attendance.create({
        timetable: timetableId,
        student: entry.student,
        status: entry.status,
        autoMarked: entry.autoMarked ?? true,
        date: today,
      });
    });

    await Promise.all(promises);
  } catch (err) {
    console.error("Error marking attendance:", err);
    throw err;
  }
};

// 2️⃣ Get attendance by timetable (review/correction)
exports.getAttendanceByTimetable = async (timetableId) => {
  try {
    const records = await Attendance.find({ timetable: timetableId })
      .populate("student", "name studentDetails")
      .sort({ date: -1 });

    return records.map(r => ({
      id: r._id,
      studentId: r.student._id,
      name: r.student.name,
      status: r.status,
      date: r.date,
      autoMarked: r.autoMarked,
    }));
  } catch (err) {
    console.error(err);
    throw err;
  }
};

// 3️⃣ Correct a specific attendance record
exports.correctAttendance = async (attendanceId, status) => {
  try {
    const record = await Attendance.findById(attendanceId);
    if (!record) throw new Error("Attendance record not found");

    record.status = status;
    record.autoMarked = false; // manual correction
    await record.save();
    return record;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

// 4️⃣ Fetch attendance analytics (college / department / year-section / student)
exports.getAttendance = async ({ type, filter }) => {
  try {
    switch (type) {
      case "college": {
        const total = await Attendance.countDocuments();
        const present = await Attendance.countDocuments({ status: "Present" });
        return { collegeAttendance: total ? ((present / total) * 100).toFixed(2) + "%" : "0%" };
      }

      case "department": {
        const aggregation = await Attendance.aggregate([
          { $lookup: { from: "users", localField: "student", foreignField: "_id", as: "student" } },
          { $unwind: "$student" },
          { $group: { _id: "$student.studentDetails.department", total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] } } } },
          { $project: { department: "$_id", attendancePercentage: { $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$present", "$total"] }, 100] }] } } },
        ]);
        return aggregation;
      }

      case "yearSection": {
        const aggregation = await Attendance.aggregate([
          { $lookup: { from: "users", localField: "student", foreignField: "_id", as: "student" } },
          { $unwind: "$student" },
          { $group: { _id: { department: "$student.studentDetails.department", year: "$student.studentDetails.year", section: "$student.studentDetails.section" }, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] } } } },
          { $project: { department: "$_id.department", year: "$_id.year", section: "$_id.section", attendancePercentage: { $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$present", "$total"] }, 100] }] } } },
        ]);
        return aggregation;
      }

      case "student": {
        const studentRecords = await Attendance.find({ student: filter.studentId }).populate("timetable");
        const result = { overall: 0, subjectWise: {} };
        let total = 0, present = 0;

        studentRecords.forEach(r => {
          const subject = r.timetable?.days?.flatMap(d => d.slots)?.find(s => s._id.equals(r.slot))?.subject || "Unknown";
          if (!result.subjectWise[subject]) result.subjectWise[subject] = { total: 0, present: 0 };
          result.subjectWise[subject].total++;
          total++;
          if (r.status === "Present") {
            result.subjectWise[subject].present++;
            present++;
          }
        });

        Object.keys(result.subjectWise).forEach(sub => {
          result.subjectWise[sub] = ((result.subjectWise[sub].present / result.subjectWise[sub].total) * 100).toFixed(2) + "%";
        });
        result.overall = total ? ((present / total) * 100).toFixed(2) + "%" : "0%";

        return result;
      }

      default:
        throw new Error("Invalid attendance type");
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
};
