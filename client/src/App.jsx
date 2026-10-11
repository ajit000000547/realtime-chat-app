import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const STORAGE_KEY = 'chatlite-auth';

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [typingUser, setTypingUser] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [socket, setSocket] = useState(null);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || contacts[0],
    [contacts, selectedContactId]
  );

  const filteredContacts = useMemo(
    () => contacts.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [contacts, searchQuery]
  );

  // PWA Installation
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const newSocket = io('http://localhost:5000', { transports: ['websocket'] });
    setSocket(newSocket);
    newSocket.emit('register_user', user);

    newSocket.on('receive_message', (message) => {
      const isThreadMatch = message.senderId === selectedContactId || message.receiverId === selectedContactId;
      if (isThreadMatch) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === message.id);
          if (exists) return prev;
          return [...prev, message];
        });
      }
    });

    newSocket.on('typing_notification', (data) => {
      if (data.senderId === selectedContactId) {
        setTypingUser(data.senderName);
        setTimeout(() => setTypingUser(''), 900);
      }
    });

    return () => newSocket.disconnect();
  }, [user, selectedContactId]);

  useEffect(() => {
    if (!user) return;

    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users');
        const data = await response.json();
        const filtered = data.filter((person) => person.id !== user.id);
        setContacts(filtered);

        if (filtered.length && !selectedContactId) {
          setSelectedContactId(filtered[0].id);
        }
      } catch (err) {
        console.error('Fetch users failed', err);
      }
    };

    fetchUsers();
  }, [user]);

  useEffect(() => {
    if (!user || !selectedContact) return;

    const fetchMessages = async () => {
      try {
        const response = await fetch(`/api/messages/${user.id}/${selectedContact.id}`);
        const data = await response.json();
        setMessages(data);

        const offlineStore = JSON.parse(localStorage.getItem('chatlite-offline') || '{}');
        const key = [user.id, selectedContact.id].sort().join('-');
        const cached = offlineStore[key] || [];
        if (cached.length) {
          setMessages((prev) => {
            const merged = [...prev, ...cached];
            const deduped = [...new Map(merged.map((msg) => [msg.id, msg])).values()];
            return deduped;
          });
        }
      } catch (err) {
        const offlineStore = JSON.parse(localStorage.getItem('chatlite-offline') || '{}');
        const key = [user.id, selectedContact.id].sort().join('-');
        setMessages(offlineStore[key] || []);
      }
    };

    fetchMessages();
  }, [selectedContact, user]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const payload = authMode === 'login'
      ? { email: form.email, password: form.password }
      : { name: form.name, email: form.email, password: form.password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authentication failed');

      setUser(data.user);
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result);
    reader.readAsDataURL(file);
  };

  const sendMessage = () => {
    if (!selectedContact) return;
    if (!draft.trim() && !selectedImage) return;

    const msg = {
      id: `${Date.now()}-${Math.random()}`,
      senderId: user.id,
      senderName: user.name,
      receiverId: selectedContact.id,
      message: draft.trim() || null,
      image: selectedImage || null,
      timestamp: Date.now(),
      type: selectedImage ? 'image' : 'text'
    };

    const offlineStore = JSON.parse(localStorage.getItem('chatlite-offline') || '{}');
    const key = [user.id, selectedContact.id].sort().join('-');
    offlineStore[key] = [...(offlineStore[key] || []), msg];
    localStorage.setItem('chatlite-offline', JSON.stringify(offlineStore));

    setMessages((prev) => [...prev, msg]);
    if (socket && isOnline) {
      socket.emit('send_message', msg);
    }

    if (socket && selectedContact) {
      socket.emit('typing_notification', {
        senderId: user.id,
        senderName: user.name,
        receiverId: selectedContact.id
      });
    }

    setDraft('');
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setContacts([]);
    setMessages([]);
    setSelectedContactId('');
    setError('');
  };

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <div className="logo-badge">
                <svg viewBox="0 0 100 100" className="logo-svg">
                  <defs>
                    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#00b19e', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#25d366', stopOpacity: 1 }} />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="50" r="48" fill="url(#logoGrad)" />
                  <path d="M35 55 L45 65 L65 45" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1>ChatLite Pro</h1>
              <p>Premium Messaging App</p>
            </div>

            <div className="mode-tabs">
              <button className={`tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => setAuthMode('login')}>Login</button>
              <button className={`tab ${authMode === 'signup' ? 'active' : ''}`} onClick={() => setAuthMode('signup')}>Sign Up</button>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'signup' && (
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="btn-primary">
                {authMode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-header">
            <h2>ChatLite</h2>
            <div className="header-icons">
              <button className="icon-btn">⚙️</button>
              <button className="icon-btn" onClick={handleLogout}>🚪</button>
            </div>
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="contacts-section">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              className={`contact-row ${selectedContactId === contact.id ? 'active' : ''}`}
              onClick={() => setSelectedContactId(contact.id)}
            >
              <div className="avatar" style={{ background: contact.color }}>
                {contact.avatar}
              </div>
              <div className="contact-info">
                <div className="contact-name">{contact.name}</div>
                <div className="contact-status">{contact.status}</div>
              </div>
              <span className={`status-dot ${contact.status === 'online' ? 'online' : 'offline'}`}></span>
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        {selectedContact ? (
          <>
            <div className="chat-top">
              <div className="chat-top-left">
                <div className="avatar" style={{ background: selectedContact.color }}>
                  {selectedContact.avatar}
                </div>
                <div className="chat-top-info">
                  <h3>{selectedContact.name}</h3>
                  <span>{typingUser ? `${typingUser} is typing...` : selectedContact.status}</span>
                </div>
              </div>
              <div className="chat-actions">
                <button className="action-btn">📞</button>
                <button className="action-btn">📹</button>
                <button className="action-btn">ℹ️</button>
              </div>
            </div>

            <div className="messages-area">
              {messages.length === 0 ? (
                <div className="empty-chat">
                  <div className="empty-icon">💬</div>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === user.id;
                  return (
                    <div key={msg.id} className={`message ${isMine ? 'sent' : 'received'}`}>
                      <div className="message-bubble">
                        {msg.type === 'image' && msg.image ? (
                          <img src={msg.image} alt="shared" className="message-image" />
                        ) : null}
                        {msg.message ? <div className="message-text">{msg.message}</div> : null}
                        <div className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="chat-input-area">
              {selectedImage ? (
                <div className="image-preview">
                  <img src={selectedImage} alt="preview" />
                  <button className="remove-btn" onClick={() => setSelectedImage(null)}>✕</button>
                </div>
              ) : null}

              <div className="input-row">
                <button className="input-btn" onClick={() => fileInputRef.current?.click()}>📎</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleImageUpload}
                />

                <input
                  type="text"
                  className="message-input"
                  placeholder={isOnline ? 'Type a message...' : 'Offline - message will be saved'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <button className="send-btn" onClick={sendMessage}>➤</button>
              </div>
            </div>
          </>
        ) : (
          <div className="no-chat">
            <div className="no-chat-icon">💭</div>
            <p>Select a contact to start messaging</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
