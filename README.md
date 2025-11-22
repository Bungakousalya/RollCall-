🎓 SmartFace – Real-Time Attendance & Personalized Guidance System

A dual-service backend combining high-performance Deep Learning (ArcFace + DeepFace) with a secure Node.js API, built to eliminate manual attendance and maximize student learning productivity.

🚀 Vision: Fixing the Education Efficiency Gap

SmartFace solves the biggest inefficiencies in schools and colleges:

Problem	and How SmartFace Solves It

⏳ Slow & error-prone manual attendance	:Fully automated attendance using DeepFace facial recognition

😶‍🌫️ Unproductive student free hours :Personalized tasks based on student goals

🎯 Students lacking clarity in routine & goals	:Auto-generated daily routines mixing timetable + self-learning goals

🕒 Delayed data and updates	:Real-time attendance broadcast via Socket.io

⚙️ Core Architecture

SmartFace runs on two core microservices to separate heavy ML tasks from API responsibilities.

🧠 Technologies Used

Backend API (Service 1 – Node.js)
Express.js
JWT Authentication
MongoDB
Socket.io (real-time updates)
Timetable merging + personalized routine generator

Face Recognition Service (Service 2 – Python)
Flask
DeepFace
ArcFace model (high-accuracy feature extraction)
OpenCV
Face detection + embedding + verification

MongoDB (Attendance Logs, Students, Goals, Schedules)
Local File System (student images, classroom photos)

✨ Features

🎯 AI Attendance:

Upload class photo → Model detects all faces → Matches with student embeddings
Sends attendance instantly to backend
Real-time status through Socket.io
🧑‍🏫 Admin Tools
Upload Excel files for Teachers/Timetables
Manage students, images & goal data
Correct or override attendance
📅 Personalized Guidance System
Suggests tasks based on:
Student goals
Past activity
Free time in daily timetable
Auto-generated routine combining classes + personal learning goals
🔔 Realtime Notifications
Attendance changes
Correction alerts
Daily routine suggestions

🛠 Installation & Setup

1️⃣ Clone the Project
git clone https://github.com/yourusername/smartface.git
cd smartface

2️⃣ Setup Node.js Backend
cd backend-api
npm install


Create .env:

MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret
CLOUDINARY_URL=your_cloudinary_url (if using cloud storage)


Run server:

npm start

3️⃣ Setup Python ML Service
cd face-recognition
pip install -r requirements.txt
python app.py

🌐 API Overview:

Students

POST /api/students

GET  /api/students

POST /api/students/upload-photo

Authentication

POST /api/auth/login

Attendance

POST /api/attendance/class-photo

GET  /api/attendance/today

Goals & Routine
POST /api/goals
GET  /api/routine

🧪 Real-Time Events (Socket.io)

Event	Description
attendance:update	Student attendance updated
attendance:corrected	Admin corrected a record
routine:new	New personalized routine generated

📸 Face Recognition Workflow:

Admin uploads student images
Python service generates embeddings using ArcFace
During class photo upload:
Detect all faces
Compare embeddings
Return recognized student IDs
Node.js logs attendance + broadcasts updates

📈 Future Enhancements:

Cloudinary image hosting
Emotion detection (engagement level)
Auto-sync with LMS systems

🤝 Contributing

Pull requests are welcome!
If you want help setting up microservices or adding features, feel free to ask.

⭐ Show Support

If you like this project, star the repo ⭐
Your support motivates further development!
