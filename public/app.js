let currentUser = null;
let socket = null;
let currentChat = null;
const BRAND_PASSWORD = 'maimun11';

const API_BASE = '/api';

function toggleAuth() {
  document.getElementById('signup-form').classList.toggle('hidden');
  document.getElementById('login-form').classList.toggle('hidden');
}

async function signup() {
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const code = document.getElementById('signup-code').value;

  try {
    const res = await fetch(API_BASE + '/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return alert(data.error || 'Signup failed');
    loginUser(data);
  } catch {
    alert('Network error during signup');
  }
}

async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(API_BASE + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return alert(data.error || 'Login failed');
    loginUser(data);
  } catch {
    alert('Network error during login');
  }
}

function loginUser(user) {
  currentUser = user;
  document.getElementById('my-code').textContent = user.code;
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('messenger').classList.remove('hidden');
  document.getElementById('no-chat').classList.remove('hidden');
  document.getElementById('messages').classList.add('hidden');
  initSocket();
}

function openBrandAuth() {
  const modal = document.getElementById('brand-modal');
  document.getElementById('brand-auth').classList.remove('hidden');
  document.getElementById('brand-message').classList.add('hidden');
  document.getElementById('brand-error').classList.add('hidden');
  document.getElementById('brand-password').value = '';
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('brand-password').focus(), 0);
}

function closeBrandModal() {
  document.getElementById('brand-modal').classList.add('hidden');
}

function submitBrandPassword() {
  const input = document.getElementById('brand-password').value;
  if (input === BRAND_PASSWORD) {
    document.getElementById('brand-auth').classList.add('hidden');
    document.getElementById('brand-message').classList.remove('hidden');
    document.getElementById('brand-error').classList.add('hidden');
  } else {
    document.getElementById('brand-error').classList.remove('hidden');
  }
}

function logout() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentUser = null;
  currentChat = null;
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('messenger').classList.add('hidden');
  document.getElementById('chat-header').classList.add('hidden');
  document.getElementById('messages').innerHTML = '';
  document.getElementById('messages').classList.add('hidden');
  document.getElementById('no-chat').classList.remove('hidden');
  document.getElementById('search-code').value = '';
}

async function searchUser() {
  const code = document.getElementById('search-code').value;
  if (!code || code.length !== 4) return alert('Enter 4-digit code');

  try {
    const res = await fetch(API_BASE + '/user/' + code);
    const user = await res.json().catch(() => ({}));
    if (!res.ok || user.error) return alert(user.error || 'User lookup failed');
    openChat(user);
  } catch {
    alert('Network error while searching user');
  }
}

// Removed chat list - single chat only


// Removed chat list


function openChat(user, chatId = null) {
  if (!chatId) {
    const ids = [String(currentUser.id), String(user.id)].sort((a,b) => a.localeCompare(b));
    chatId = ids.join('-');
  }
  currentChat = { id: chatId, partner: user };
  
  document.getElementById('chat-title').textContent = `${user.email} (${user.code})`;
  document.getElementById('chat-header').classList.remove('hidden');
  document.getElementById('no-chat').classList.add('hidden');
  document.getElementById('messages').classList.remove('hidden');
  socket.emit('join_chat', chatId);
  loadMessages(chatId);
}

function toggleDeleteMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('delete-menu');
  menu.classList.toggle('hidden');
}

async function deleteMessages(mode) {
  const label = mode === 'all' ? 'ALL' : 'the oldest 50%';
  if (!confirm(`Delete ${label} of messages? This cannot be undone.`)) return;

  try {
    const res = await fetch(API_BASE + '/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) return alert(data.error || 'Delete failed');
    if (currentChat) {
      loadMessages(currentChat.id);
    }
    document.getElementById('delete-menu').classList.add('hidden');
  } catch {
    alert('Network error during delete');
  }
}

function buildMessageElement(msg) {
  const isMe = msg.from_id == currentUser.id;
  const div = document.createElement('div');
  div.className = `message ${isMe ? 'sent' : 'received'}`;

  const body = document.createElement('div');
  body.textContent = msg.text;

  const meta = document.createElement('small');
  meta.style.opacity = '0.7';
  meta.style.fontSize = '12px';
  meta.textContent = new Date(msg.timestamp).toLocaleTimeString();

  div.append(body, meta);
  return div;
}

async function loadMessages(chatId) {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  try {
    const res = await fetch(API_BASE + '/messages/' + chatId + '/' + currentUser.id);
    const messages = await res.json().catch(() => ([]));
    if (!res.ok || messages.error) {
      container.innerHTML = '<div class="no-chat">Failed to load messages.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    messages.forEach((msg) => {
      frag.appendChild(buildMessageElement(msg));
    });
    container.appendChild(frag);
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 100);
  } catch {
    container.innerHTML = '<div class="no-chat">Network error loading messages.</div>';
  }
}

function sendMessage() {
  const text = document.getElementById('message-text').value.trim();
  if (!text || !currentChat) return;
  
  socket.emit('send_message', { chatId: currentChat.id, text });
  document.getElementById('message-text').value = '';
}

function initSocket() {
  socket = io();
  socket.emit('user_join', currentUser.id);
  
socket.on('new_message', (msg) => {
    if (msg.chat_id === currentChat?.id) {
      const container = document.getElementById('messages');
      container.appendChild(buildMessageElement(msg));
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 0);
    }
  });
}

// Init
document.getElementById('login-form').classList.add('hidden');
document.getElementById('signup-form').classList.remove('hidden');

document.addEventListener('click', () => {
  const menu = document.getElementById('delete-menu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
});

document.getElementById('brand-password')?.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    submitBrandPassword();
  }
});
