// require('dotenv').config();
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const path = require('path');


// const app = express();

// // Middleware
// app.use(cors());
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // Database connection
// mongoose.connect(process.env.MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// })
// .then(() => console.log("MongoDB connected!"))
// .catch(err => console.error(err));

// // Routes
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/admin', require('./routes/admin'));
// app.use('/api/teacher', require('./routes/teacher'));
// app.use('/api/student', require('./routes/student'));
// app.use('/api/attendance', require('./routes/attendance'));
// app.use('/api/hod', require('./routes/hod'));



// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });








require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./model/User');

const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected!"))
.catch(err => console.error("❌ MongoDB connection error:", err));

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL // Automatically uses the URL
});

// Socket.io Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.token;
    
    if (!token) {
      console.log('❌ No token provided for socket connection');
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      console.log('❌ Invalid user for socket connection');
      return next(new Error('Authentication error: User not found'));
    }

    socket.userId = user._id;
    socket.userRole = user.role;
    socket.userData = {
      name: user.name,
      department: user.department,
      year: user.year,
      section: user.section
    };
    
    console.log(`🔐 Authenticated socket for ${user.role}: ${user.name}`);
    next();
  } catch (error) {
    console.log('❌ Socket authentication failed:', error.message);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.io Connection Handling
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id} (${socket.userRole}: ${socket.userData.name})`);

  // STUDENT: Join their specific classroom
  socket.on('join-classroom', (data) => {
    if (socket.userRole !== 'student') {
      socket.emit('error', { message: 'Only students can join classrooms' });
      return;
    }

    const roomName = `class-${socket.userData.department}-${socket.userData.year}-${socket.userData.section}`;
    socket.join(roomName);
    
    console.log(`🎓 Student ${socket.userData.name} joined ${roomName}`);
    socket.emit('joined-classroom', { 
      room: roomName, 
      message: `Joined ${socket.userData.department} Year ${socket.userData.year} Section ${socket.userData.section}` 
    });
  });

  // TEACHER: Join their personal room and classrooms they teach
  socket.on('join-teacher', async () => {
    if (socket.userRole !== 'teacher' && socket.userRole !== 'admin') {
      socket.emit('error', { message: 'Only teachers can join teacher rooms' });
      return;
    }

    // Join teacher's personal room
    const teacherRoom = `teacher-${socket.userId}`;
    socket.join(teacherRoom);

    // Also join all classrooms this teacher teaches
    try {
      const Timetable = require('./model/Timetable');
      const timetables = await Timetable.find({
        'schedule.slots.teacher': socket.userId
      });

      timetables.forEach(timetable => {
        const classroomRoom = `class-${timetable.department}-${timetable.year}-${timetable.section}`;
        socket.join(classroomRoom);
        console.log(`👨‍🏫 Teacher ${socket.userData.name} joined ${classroomRoom}`);
      });

      socket.emit('joined-teacher', { 
        personalRoom: teacherRoom,
        message: 'Teacher joined all relevant classrooms' 
      });
    } catch (error) {
      console.error('Error joining teacher classrooms:', error);
    }
  });

  // STUDENT: Join personal room for individual updates
  socket.on('join-student', () => {
    if (socket.userRole !== 'student') {
      socket.emit('error', { message: 'Only students can join student rooms' });
      return;
    }

    const studentRoom = `student-${socket.userId}`;
    socket.join(studentRoom);
    console.log(`🎓 Student ${socket.userData.name} joined personal room: ${studentRoom}`);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`❌ Client disconnected: ${socket.id} (${socket.userData?.name}) - Reason: ${reason}`);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.userData?.name}:`, error);
  });

  // Health check
  socket.on('ping', (data) => {
    socket.emit('pong', { 
      timestamp: new Date().toISOString(),
      user: socket.userData?.name,
      role: socket.userRole
    });
  });
});

// Make io available to all routes
app.set('io', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/student', require('./routes/student'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/hod', require('./routes/hod'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount
  });
});

// Socket.io status endpoint
app.get('/socket-status', (req, res) => {
  const sockets = Array.from(io.sockets.sockets.values()).map(socket => ({
    id: socket.id,
    userId: socket.userId,
    role: socket.userRole,
    name: socket.userData?.name,
    rooms: Array.from(socket.rooms)
  }));

  res.json({
    totalConnections: io.engine.clientsCount,
    sockets: sockets
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server error:', error);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

const PORT = process.env.PORT || 5000;

// Start server with HTTP server (not app.listen)
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.io enabled for real-time communication`);
  console.log(`📱 Real-time attendance broadcasting ready!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down server gracefully...');
  io.disconnectSockets();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});


