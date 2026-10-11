# ChatLite

A WhatsApp-like real-time chat web app with:
- live messaging via Socket.IO
- image sending support
- offline message storage using localStorage
- responsive chat UI

## Run locally

1. Install root dependencies:
   npm install

2. Install frontend dependencies:
   cd client && npm install

3. Start both frontend and backend:
   cd .. && npm run dev

4. Open:
   http://localhost:5173

## Features
- Real-time chat between users
- Local offline queue for unsent messages
- Image attachments in chat
- Message persistence in browser storage
- Modern WhatsApp-inspired interface
