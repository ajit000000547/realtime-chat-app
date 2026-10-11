const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const users = [
  { id: 'me', name: 'You', avatar: '😊', status: 'Available', color: '#3b82f6' },
  { id: 'alice', name: 'Alice', avatar: '👩‍💻', status: 'online', color: '#10b981' },
  { id: 'john', name: 'John', avatar: '🧑‍💼', status: 'typing...', color: '#f59e0b' },
  { id: 'sara', name: 'Sara', avatar: '👩‍🎨', status: 'online', color: '#8b5cf6' },
  { id: 'mike', name: 'Mike', avatar: '🧑‍🔧', status: 'offline', color: '#94a3b8' }
];

const demoMessages = [
  {
    id: 'm1',
    senderId: 'alice',
    senderName: 'Alice',
    receiverId: 'me',
    message: 'Hey! Are you free for a quick call today?',
    image: null,
    timestamp: Date.now() - 120000,
    type: 'text'
  },
  {
    id: 'm2',
    senderId: 'me',
    senderName: 'You',
    receiverId: 'alice',
    message: 'Yes, let’s do it after 6 PM.',
    image: null,
    timestamp: Date.now() - 90000,
    type: 'text'
  },
  {
    id: 'm3',
    senderId: 'alice',
    senderName: 'Alice',
    receiverId: 'me',
    message: null,
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80',
    timestamp: Date.now() - 40000,
    type: 'image'
  }
];

const messages = new Map();
users.forEach((user) => {
  if (user.id !== 'me') {
    messages.set(`${user.id}-me`, demoMessages.slice());
  }
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('register_user', (user) => {
    onlineUsers.set(socket.id, user.id);
    io.emit('online_users', Array.from(new Set([...onlineUsers.values()])));
    socket.emit('registered', { success: true, user });
  });

  socket.on('send_message', (payload) => {
    const savedMessage = {
      id: Date.now().toString(),
      senderId: payload.senderId,
      senderName: payload.senderName,
      receiverId: payload.receiverId,
      message: payload.message || null,
      image: payload.image || null,
      timestamp: Date.now(),
      type: payload.type || 'text'
    };

    const key = [payload.senderId, payload.receiverId].sort().join('-');
    const current = messages.get(key) || [];
    current.push(savedMessage);
    messages.set(key, current);

    io.emit('receive_message', savedMessage);
    socket.emit('message_sent', savedMessage);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_users', Array.from(new Set([...onlineUsers.values()])));
    console.log('Client disconnected:', socket.id);
  });
});

app.get('/api/users', (req, res) => {
  res.json(users.filter((user) => user.id !== 'me'));
});

app.get('/api/messages/:userId/:otherUserId', (req, res) => {
  const { userId, otherUserId } = req.params;
  const key = [userId, otherUserId].sort().join('-');
  const result = messages.get(key) || [];
  res.json(result);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.length });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
