# FibreGemsCRM

FibreGemsCRM/
├── index.html          ← Login (root)
├── Code.gs             ← Backend
├── js/
│   ├── api.js          ← Shared API client
│   └── auth.js         ← Shared auth + routing
├── admin/
│   ├── index.html
│   └── admin.js
├── agent/
│   ├── index.html
│   └── agent.js
└── support/
    ├── index.html
    └── support.js


# Deploy:
1. Open FibreGemsCRM/Code.gs in Apps Script editor.
2. Deploy as Web App (execute as: User accessing the web app, Who has access: Anyone within FibreGems).
3. Copy the web app URL.

# Access:
- Admin: <web-app-url>/admin
- Agent: <web-app-url>/agent
- Support: <web-app-url>/support
- Login: <web-app-url>
