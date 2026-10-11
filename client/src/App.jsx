import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const currentUser = {
  id: 'me',
  name: 'You',
  avatar: '😊',
  status: 'Available',
  color: '#3b82f6'
};

const STORAGE_KEY = 'whatsapp-lite-offline-store';

function App() {
  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('alice');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [selectedImage, setSelectedImage] = useState(null);
  const [typingUser, setTypingUser] = useState('');
  const [socket, setSocket] = useState(null);
  const fileInputRef = useRef(null);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) || contacts[0],
    [contacts, selectedContactId]
  );

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        setContacts(data);
        if (data.length && !selectedContactId) {
          setSelectedContactId(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching contacts', error);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    const newSocket = io({ transports: ['websocket'] });
    setSocket(newSocket);

    newSocket.emit('register_user', currentUser);

    newSocket.on('receive_message', (msg) => {
      const receiverKey = msg.receiverId === currentUser.id ? msg.senderId : msg.receiverId;
      if (receiverKey === selectedContactId || msg.senderId === selectedContactId) {
        setMessages((prev) => [...prev, msg]);
      }

      const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const chatKey = [currentUser.id, selectedContactId].sort().join('-');
      store[chatKey] = [...(store[chatKey] || []), msg];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    });

    newSocket.on('online_users', (users) => {
      console.log('online users', users);
    });

    newSocket.on('typing_notification', (data) => {
      if (data.senderId === selectedContactId) {
        setTypingUser(data.senderName);
        setTimeout(() => setTypingUser(''), 800);
      }
    });

    return () => newSocket.disconnect();
  }, [selectedContactId]);

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
    if (!selectedContact) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages/${currentUser.id}/${selectedContact.id}`);
        const data = await res.json();
        setMessages(data);

        const offlineStore = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const key = [currentUser.id, selectedContact.id].sort().join('-');
        const offlineMessages = offlineStore[key] || [];

        if (offlineMessages.length) {
          setMessages((prev) => [...new Map([...prev, ...offlineMessages].map((m) => [m.id, m])).values()]);
        }
      } catch (error) {
        const offlineStore = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const key = [currentUser.id, selectedContact.id].sort().join('-');
        setMessages(offlineStore[key] || []);
      }
    };

    fetchMessages();
  }, [selectedContact]);

  const sendMessage = () => {
    if (!draft.trim() && !selectedImage) return;

    const msg = {
      id: `${Date.now()}-${Math.random()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      receiverId: selectedContact.id,
      message: draft.trim() || null,
      image: selectedImage || null,
      timestamp: Date.now(),
      type: selectedImage ? 'image' : 'text'
    };

    const key = [currentUser.id, selectedContact.id].sort().join('-');
    const offlineStore = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    offlineStore[key] = [...(offlineStore[key] || []), msg];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offlineStore));

    if (isOnline && socket) {
      socket.emit('send_message', msg);
      setMessages((prev) => [...prev, msg]);
    } else {
      setMessages((prev) => [...prev, msg]);
    }

    setDraft('');
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTyping = (value) => {
    setDraft(value);

    if (socket && selectedContact) {
      socket.emit('typing_notification', {
        senderId: currentUser.id,
        senderName: currentUser.name,
        receiverId: selectedContact.id
      });
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-block">
            <span className="brand-icon">💬</span>
            <h2>ChatLite</h2>
          </div>
          <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="profile-card">
          <div className="avatar large" style={{ background: currentUser.color }}>{currentUser.avatar}</div>
          <div>
            <h3>{currentUser.name}</h3>
            <small>{currentUser.status}</small>
          </div>
        </div>

        <div className="contact-list">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              className={`contact-item ${selectedContactId === contact.id ? 'active' : ''}`}
              onClick={() => setSelectedContactId(contact.id)}
            >
              <div className="avatar" style={{ background: contact.color }}>{contact.avatar}</div>
              <div className="contact-meta">
                <div className="row">
                  <strong>{contact.name}</strong>
                  <span className={`dot ${contact.status === 'online' ? 'green' : 'gray'}`} />
                </div>
                <small>{contact.status}</small>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-panel">
        {selectedContact ? (
          <>
            <header className="chat-header">
              <div className="chat-user">
                <div className="avatar" style={{ background: selectedContact.color }}>{selectedContact.avatar}</div>
                <div>
                  <h3>{selectedContact.name}</h3>
                  <small>{typingUser ? `${typingUser} is typing...` : selectedContact.status}</small>
                </div>
              </div>
              <div className="header-actions">
                <button>📞</button>
                <button>📹</button>
                <button>⋮</button>
              </div>
            </header>

            <div className="message-list">
              {messages.map((msg) => {
                const isMine = msg.senderId === currentUser.id;
                return (
                  <div key={msg.id} className={`message-row ${isMine ? 'mine' : ''}`}>
                    <div className={`bubble ${isMine ? 'mine' : 'other'}`}>
                      {msg.type === 'image' && msg.image ? (
                        <img src={msg.image} alt="shared message" className="sent-image" />
                      ) : null}
                      {msg.message ? <p>{msg.message}</p> : null}
                      <small>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="composer">
              {selectedImage ? (
                <div className="preview-box">
                  <img src={selectedImage} alt="selected preview" />
                  <button onClick={() => setSelectedImage(null)}>Remove</button>
                </div>
              ) : null}

              <div className="composer-row">
                <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>📷</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleImageUpload}
                />

                <input
                  value={draft}
                  onChange={(e) => handleTyping(e.target.value)}
                  placeholder={isOnline ? 'Type a message...' : 'You are offline, messages will be saved locally'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendMessage();
                  }}
                />

                <button className="send-btn" onClick={sendMessage}>Send</button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">Select a contact to start chatting</div>
        )}
      </main>
    </div>
  );
}

export default App;
