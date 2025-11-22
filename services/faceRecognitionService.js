const fs = require('fs');
// Use axios for HTTP requests (node-fetch is not listed in backend/package.json)
const axios = require('axios');
const FormData = require('form-data');

const DEEPFACE_URL = 'http://localhost:5001/recognize';

class FaceRecognitionService {
  async processClassPhoto(classPhotoPath, students) {
    try {
      console.log('📸 Processing class photo with DeepFace...');
      console.log('Students to match:', students.map(s => ({ userId: s.userId, name: s.name })));
      
      // Check if file exists
      if (!fs.existsSync(classPhotoPath)) {
        throw new Error(`Class photo not found: ${classPhotoPath}`);
      }

      // Ensure students is an array
      students = Array.isArray(students) ? students : [];

      const formData = new FormData();
      formData.append('classPhoto', fs.createReadStream(classPhotoPath));

      console.log('🔄 Sending request to DeepFace service...');
      
      // Post to DeepFace service using axios
      const response = await axios.post(DEEPFACE_URL, formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (!response || response.status < 200 || response.status >= 300) {
        const errorText = response && response.data ? JSON.stringify(response.data) : 'No response body';
        console.error('❌ DeepFace service error:', errorText);
        throw new Error(`DeepFace service failed: ${response ? response.status : 'no-response'} - ${errorText}`);
      }

      const result = response.data;
      console.log('✅ DeepFace response:', result);

      // Extract present students from DeepFace response
  // Normalize IDs to strings to make comparisons safe
  const presentStudentIds = (result.presentStudents || []).map(String);
  console.log('🎯 Recognized students:', presentStudentIds);

      // Create attendance records for all students
      const studentAttendance = students.map(student => {
        const sid = student.userId != null ? String(student.userId) : String(student._id || '');
        const isPresent = presentStudentIds.includes(sid);
        return {
          student: student._id,
          status: isPresent ? 'present' : 'absent',
          confidence: isPresent ? 95 : 0, // DeepFace doesn't return confidence here
          manuallyMarked: false
        };
      });

      const presentCount = studentAttendance.filter(s => s.status === 'present').length;
      const absentCount = students.length - presentCount;
      const attendancePercentage = students.length > 0 ? 
        Math.round((presentCount / students.length) * 100) : 0;

      return {
        students: studentAttendance,
        presentCount,
        absentCount,
        attendancePercentage,
        unrecognizedFaces: result.unrecognizedFacesCount || 0
      };

    } catch (error) {
      console.error('❌ Face recognition error:', error && error.stack ? error.stack : error);
      
      // Fallback: mark all as absent
      const studentAttendance = (Array.isArray(students) ? students : []).map(student => ({
        student: student._id,
        status: 'absent',
        confidence: 0,
        manuallyMarked: false
      }));

      return {
        students: studentAttendance,
        presentCount: 0,
        absentCount: students.length,
        attendancePercentage: 0,
        unrecognizedFaces: 0,
        error: error && error.message ? error.message : String(error)
      };
    }
  }
}

module.exports = new FaceRecognitionService();