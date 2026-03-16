require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_web_chat_app';
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000
}).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, trim: true },
  password_hash: { type: String, required: true },
  code: { type: String, unique: true, required: true }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  chat_id: { type: String, index: true, required: true },
  from_id: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Signup
app.post('/api/signup', async (req, res) => {
  const { email, password, code } = req.body;
  if (!/^\d{4}$/.test(code)) return res.status(400).json({ error: '4-digit code required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password_hash: hash, code });
    res.json({ id: user._id.toString(), code: user.code });
  } catch (err) {
    return res.status(400).json({ error: 'Email/code exists' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  User.findOne({ email }).then(async (user) => {
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ id: user._id.toString(), code: user.code });
  }).catch(() => {
    res.status(500).json({ error: 'Server error' });
  });
});

// Search user
app.get('/api/user/:code', (req, res) => {
  User.findOne({ code: req.params.code }).then((user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user._id.toString(), code: user.code, email: user.email });
  }).catch(() => {
    res.status(500).json({ error: 'Server error' });
  });
});

// Get messages
app.get('/api/messages/:chatId/:userId', (req, res) => {
  const [id1, id2] = req.params.chatId.split('-');
  if (req.params.userId !== id1 && req.params.userId !== id2) return res.status(403).json({ error: 'Unauthorized' });
  Message.find({ chat_id: req.params.chatId }).sort({ timestamp: 1 }).lean().then((rows) => {
    res.json(rows.map((row) => ({
      id: row._id.toString(),
      chat_id: row.chat_id,
      from_id: row.from_id,
      text: row.text,
      timestamp: row.timestamp
    })));
  }).catch(() => {
    res.status(500).json({ error: 'Server error' });
  });
});

// Delete messages (maintenance)
app.delete('/api/messages', async (req, res) => {
  const { mode } = req.body || {};
  if (!['half', 'all'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid delete mode' });
  }

  try {
    if (mode === 'all') {
      const result = await Message.deleteMany({});
      return res.json({ deleted: result.deletedCount });
    }

    const total = await Message.countDocuments();
    const toDelete = Math.floor(total / 2);
    if (toDelete === 0) return res.json({ deleted: 0 });

    const ids = await Message.find({}, { _id: 1 })
      .sort({ timestamp: 1 })
      .limit(toDelete)
      .lean();

    const result = await Message.deleteMany({ _id: { $in: ids.map(doc => doc._id) } });
    return res.json({ deleted: result.deletedCount });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get recent chats (not used in UI yet)
app.get('/api/chats/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const recent = await Message.aggregate([
      { $match: { chat_id: new RegExp(`(^${userId}-|-${userId}$)`) } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$chat_id', last_message: { $first: '$timestamp' } } },
      { $sort: { last_message: -1 } }
    ]);
    res.json(recent.map(r => ({ chat_id: r._id, last_message: r.last_message })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('user_join', (userId) => {
    socket.userId = userId;
  });

  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
  });

  socket.on('send_message', ({ chatId, text }) => {
    const userId = socket.userId;
    if (!userId) return;
    Message.create({ chat_id: chatId, from_id: userId, text }).then((doc) => {
      io.to(chatId).emit('new_message', {
        id: doc._id.toString(),
        chat_id: chatId,
        from_id: userId,
        text,
        timestamp: doc.timestamp
      });
    });
  });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Messenger server on port ${PORT}`);
});
