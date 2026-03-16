# Facebook Messenger Clone - Build Steps

## Information Gathered:
Previous complex request/conn system buggy. User wants Facebook Messenger style: simple search by code → direct chat, real-time, left/right messages.

## Plan:
1. **server.js:** Keep users table. Add messages table (chatId = sorted userIds). Routes: /search/:code, /messages/:chatId. Socket rooms by chatId.
2. **public/index.html:** Messenger UI - left sidebar (recent chats), right chat window, search input.
3. **public/app.js:** Login → search code → create/open chat, real-time socket.
4. **style.css:** Messenger-like dark UI.
5. Deploy ready.

## Dependent Files: All replaced.

## Followup: `node server.js` → test → Render deploy.

**Next: Replace server.js**

