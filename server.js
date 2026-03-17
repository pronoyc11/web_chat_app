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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/web_chat_app_upgraded';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000
}).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

function ensureDbReady(res) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ error: 'Database not connected. Check MONGODB_URI or Atlas network access.' });
    return false;
  }
  return true;
}

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
  if (!ensureDbReady(res)) return;
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
  if (!ensureDbReady(res)) return;
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
  if (!ensureDbReady(res)) return;
  User.findOne({ code: req.params.code }).then((user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user._id.toString(), code: user.code, email: user.email });
  }).catch(() => {
    res.status(500).json({ error: 'Server error' });
  });
});

// Get messages
app.get('/api/messages/:chatId/:userId', (req, res) => {
  if (!ensureDbReady(res)) return;
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
  if (!ensureDbReady(res)) return;
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
  if (!ensureDbReady(res)) return;
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

// Get connections (users who have sent messages to this user)
app.get('/api/connections/:userId', async (req, res) => {
  if (!ensureDbReady(res)) return;
  const userId = req.params.userId;
  try {
    const rows = await Message.aggregate([
      {
        $match: {
          chat_id: new RegExp(`(^${userId}-|-${userId}$)`),
          from_id: { $ne: userId }
        }
      },
      {
        $group: {
          _id: '$from_id',
          last_message: { $max: '$timestamp' }
        }
      },
      { $sort: { last_message: -1 } }
    ]);

    const senderIds = rows.map(r => r._id);
    if (senderIds.length === 0) return res.json([]);

    const users = await User.find(
      { _id: { $in: senderIds } },
      { email: 1, code: 1 }
    ).lean();

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const result = rows.map(r => {
      const user = userMap.get(String(r._id));
      if (!user) return null;
      return {
        id: user._id.toString(),
        email: user.email,
        code: user.code,
        last_message: r.last_message
      };
    }).filter(Boolean);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('user_join', (userId) => {
    socket.userId = userId;
    socket.join(`user:${userId}`);
  });

  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
  });

  socket.on('send_message', ({ chatId, text }) => {
    const userId = socket.userId;
    if (!userId) return;
    Message.create({ chat_id: chatId, from_id: userId, text }).then((doc) => {
      const payload = {
        id: doc._id.toString(),
        chat_id: chatId,
        from_id: userId,
        text,
        timestamp: doc.timestamp
      };
      io.to(chatId).emit('new_message', payload);

      const [id1, id2] = chatId.split('-');
      io.to(`user:${id1}`).emit('incoming_message', payload);
      io.to(`user:${id2}`).emit('incoming_message', payload);
    });
  });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Messenger server on port ${PORT}`);
});
