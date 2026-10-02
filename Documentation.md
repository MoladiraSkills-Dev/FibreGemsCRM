# FibreGems CRM — Developer Documentation

> **Audience:** New developers joining the project.
> **Goal:** Understand every part of the system — architecture, database, backend API, frontend portals, and business rules — so you can confidently maintain, extend, and debug it.
> **Last synced from:** GitHub branch `main` (latest commit: `ce3993b Support Role Update v4`)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture and Tech Stack](#2-architecture-and-tech-stack)
3. [File and Folder Structure](#3-file-and-folder-structure)
4. [Google Sheets — The Database](#4-google-sheets--the-database)
5. [Backend — Code.gs (Google Apps Script)](#5-backend--codegs-google-apps-script)
6. [Frontend Portals — HTML Pages](#6-frontend-portals--html-pages)
7. [Frontend JavaScript Modules](#7-frontend-javascript-modules)
8. [Authentication, Roles, and Session Flow](#8-authentication-roles-and-session-flow)
9. [Customer Lifecycle, Statuses, and Business Rules](#9-customer-lifecycle-statuses-and-business-rules)
10. [The Daily Queue Workflow (Agent Callback System)](#10-the-daily-queue-workflow-agent-callback-system)
11. [EasyPay System](#11-easypay-system)
12. [Referral System](#12-referral-system)
13. [Lead Lifecycle Engine (Automated Rules)](#13-lead-lifecycle-engine-automated-rules)
14. [Agility Sync Engine](#14-agility-sync-engine)
15. [Support Portal](#15-support-portal)
16. [Admin Agent Management](#16-admin-agent-management)
17. [Caching System (Two-Tier)](#17-caching-system-two-tier)
18. [Security Model](#18-security-model)
19. [CORS and Network Considerations](#19-cors-and-network-considerations)
20. [How to Deploy / Make Changes](#20-how-to-deploy--make-changes)

---

## 1. Project Overview

**FibreGems CRM** is a serverless, fully custom Customer Relationship Management system for FibreGems, an ISP (Internet Service Provider) channel partner operating in South Africa. It manages the complete sales pipeline from lead capture through to activation.

**Three types of users:**

| Role | Portal | What they do |
|---|---|---|
| Agent | `/agent/index.html` | Capture leads, manage their own pipeline, log call outcomes |
| Admin | `/admin/index.html` | Monitor all agents, view master grid, run Agility import, manage users |
| Support | `/support/index.html` | Track ISP infrastructure tickets from SADV and Infinifi providers |

**Core design principle — no traditional server:**

- **Google Sheets** = the database (all data lives in one spreadsheet).
- **Google Apps Script** = the backend API (deployed as a Web App on Google's free infrastructure).
- **Static HTML/CSS/JS files** = the frontend (hosted on GitHub Pages, zero cost).

---

## 2. Architecture and Tech Stack

```
[ Browser (Agent / Admin / Support) ]
        |
        |  HTTPS POST  (Content-Type: text/plain)
        |  Body: { action, payload, token }
        v
[ Google Apps Script Web App ]   <─── doPost() router in Code.gs
        |
        |  SpreadsheetApp Read / Write
        v
[ Google Sheets — Main CRM DB ]      [ Google Sheets — Support DB ]
  +── CUSTOMERS (34 cols)              +── AUGSEP (SADV tickets)
  +── ORDERS                           +── Infinifi customers
  +── PAYMENTS
  +── ACTIVATIONS
  +── ACTIVITY_LOG
  +── Daily_Logs
  +── Users
  +── Agility REPORT
```

| Layer | Technology | Notes |
|---|---|---|
| Frontend | HTML5 + Tailwind CSS (CDN) + Vanilla JS | No build step; load order matters |
| Fonts | Google Fonts — Montserrat | Loaded from CDN |
| Backend | Google Apps Script (GAS) | Free tier; ~6 min execution limit per call |
| Main Database | Google Sheets (one spreadsheet) | Multiple named tabs = tables |
| Support Database | Separate Google Sheets file | Referenced via `SUPPORT_SHEET_ID` |
| Hosting | GitHub Pages (or any static host) | Static files only |
| Auth | Custom token-based sessions | Stored in `sessionStorage` — zero server sessions |
| Caching | Two-tier browser cache (sessionStorage + localStorage) + GAS ScriptCache | Reduces cold-start latency dramatically |

---

## 3. File and Folder Structure

```
FibreGemsCRM/
│
├── index.html           # Login page — root entry point for all users
│
├── Code.gs              # ENTIRE backend: API router + all business logic
│
├── js/
│   ├── api.js           # Shared: fetch wrapper, two-tier cache, session store
│   └── auth.js          # Shared: auth guards, login, logout, toast, routing
│
├── agent/
│   ├── index.html       # Agent portal (daily queue, worklist, new lead form)
│   └── agent.js         # Agent portal JavaScript logic
│
├── admin/
│   ├── index.html       # Admin portal (dashboard, master grid, sync, user mgmt)
│   └── admin.js         # Admin portal JavaScript logic
│
├── support/
│   ├── index.html       # Support portal (SADV + Infinifi tickets)
│   └── support.js       # Support portal JavaScript logic
│
├── images/
│   └── logo.png         # FibreGems logo (login page)
│
├── Documentation.md     # This file
├── spreedsheet_db.md    # Full database schema specification
├── README.md            # Quick deploy reference
└── promt doc.md         # AI prompt engineering / design history
```

> **Script loading order is critical.** Every HTML page loads scripts in this exact order:
> `js/api.js` → `js/auth.js` → `[portal].js`
> This is because `agent.js`, `admin.js`, and `support.js` all depend on `callBackend`, `session`, `showToast`, and other functions defined in the shared modules.

---

## 4. Google Sheets — The Database

The entire CRM database is a single Google Spreadsheet. There is also a **separate** Support Spreadsheet for ticket data.

### Users Sheet

Stores all user accounts. Adding or removing users is done here manually (no self-registration).

| Col | Field | Notes |
|---|---|---|
| 0 | Agent_ID | e.g., `AGT-BA4CF56E` (auto-generated on create) |
| 1 | Full_Name | Display name |
| 2 | Email | Login email (case-insensitive match) |
| 3 | Password_Hash | SHA-256 hash of `password + salt` |
| 4 | Salt | Per-user random UUID salt |
| 5 | Role | `Admin`, `Agent`, or `Support` |
| 6 | Status | Must be `Verified` to allow login; `Inactive` = soft deleted |
| 7 | Temp_Password | Plaintext temp password set by admin (visible to admin only) |
| 8 | Created_At | ISO timestamp |

### Daily_Logs Sheet

Tracks login sessions. One row per login event.

| Col | Field | Notes |
|---|---|---|
| 0 | LogID | Short UUID (8 chars) |
| 1 | AgentID | Foreign key to Users |
| 2 | Name | Agent name at login |
| 3 | Date | `yyyy-MM-dd` |
| 4 | LoginTime | Full timestamp |
| 5 | LastActive | Updated timestamp |
| 6 | Token | Session token (UUID) sent with every API request |

> The `token` column (col 6) is **the entire authentication mechanism**. Every protected API call searches this sheet for a matching token to identify and validate the caller.

### CUSTOMERS Sheet (34 Columns)

The central table. Every customer is one row. Full column map:

| Col | Field | Notes |
|---|---|---|
| 0 | Customer_ID | `CUS-XXXXXXXX` format |
| 1 | Record_Status | `Active`, `Archived`, or `Expired` |
| 2 | Created_DateTime | ISO timestamp |
| 3 | Agent_Name | Creator's AgentID |
| 4 | Last_Updated_DateTime | Updated on every write |
| 5 | Full_Name | Concatenated first + surname |
| 6 | Cell_Number | Primary phone — used for duplicate detection |
| 7 | Alternate_Cell_Number | |
| 8 | Email | |
| 9 | Full_Address | |
| 10 | Area_Suburb | |
| 11 | Product_Package | e.g., `Vuma Reach 20Mbps/10Mbps` |
| 12 | Payment_Type | `Prepaid`, `Debit Order`, `EasyPay` |
| 13 | Order_Date | Set automatically when status = Sale Won |
| 14 | Current_Owner_ID | AgentID of who owns this customer |
| 15 | Team_Leader_ID | Supervisor AgentID |
| 16 | Customer_Status | Pipeline status (see Section 9) |
| 17 | Next_Action | e.g., `Customer Callback`, `Follow Up Payment` |
| 18 | Next_Action_Date | `yyyy-MM-dd` — drives the Daily Queue |
| 19 | Last_Contact_Date | Updated every time agent logs an outcome |
| 20 | Order_Number | OVR/OVK reference — entered manually by agent |
| 21 | EasyPay_Number | Entered manually by agent — never auto-generated |
| 22 | EasyPay_Cycle | `Cycle 1 of 3`, `Cycle 2 of 3`, `Cycle 3 of 3` |
| 23 | Referral_Code | Unique customer code (e.g., `REF-ABC123`) |
| 24 | Referred_By_Code | Code of the customer who referred this one |
| 25 | EasyPay_Expiry_Date | 14 days after EasyPay issuance |
| 26 | Activation_Date | Set when status = Activated |
| 27 | Promised_Payment_Date | Date customer promised to pay |
| 28 | Escalation_Flag | `True` / `False` |
| 29 | Escalation_Level | `Level 2 - Supervisor Alert` or `Level 3 - Operations Escalation` |
| 30 | Escalation_Reason | Auto-generated description |
| 31 | Last_Outcome | Last logged call outcome |
| 32 | Referral_Count | How many new leads this customer has referred (auto-incremented) |
| 33 | Next_Action_Time | `HH:MM` — hides lead until 5 mins before scheduled call |

### ORDERS Sheet (15 Columns)

One row per order event. Multiple rows can exist per customer (e.g., if EasyPay is re-issued).

| Col | Field | Notes |
|---|---|---|
| 0 | Order_ID | OVR/OVK number or blank |
| 1 | Customer_ID | Foreign key |
| 2 | Customer_Name | |
| 3 | Order_Date | |
| 4 | SADV_OVR_Number | Used by Agility Sync to match residential orders |
| 5 | SADV_OVK_Number | Used by Agility Sync to match business orders |
| 6 | Agent_Name | |
| 7 | Order_Status | e.g., `Sale Completed`, `Pending (Re-issued EP)` |
| 8 | Next_Action | |
| 9 | Action_Date | |
| 10 | Import_Date | |
| 11 | Source | `Direct Capture`, `Agent Portal Update`, `Auto-Imported` |
| 12 | EasyPay_Number | |
| 13 | EasyPay_Cycle | |
| 14 | EasyPay_Expiry_Date | |

### PAYMENTS Sheet

| Col | Field | Notes |
|---|---|---|
| 0 | Payment_ID | `PAY-XXXXXXXX` |
| 1 | Customer_ID | Foreign key |
| 2 | Payment_Status | `Pending`, `Paid`, `Failed`, `Expired` |
| 3 | Promised_Payment_Date | |
| 4 | Payment_Amount | |
| 5 | Payment_Timestamp | |

### ACTIVATIONS Sheet

| Col | Field | Notes |
|---|---|---|
| 0 | Activation_ID | `ACT-XXXXXXXX` |
| 1 | Customer_ID | Foreign key |
| 2 | Activation_Status | `Pending` or `Activated` |
| 3 | Activation_Date | |
| 4 | Activation_Timestamp | |

### ACTIVITY_LOG Sheet (18 Columns)

An immutable audit trail. Every agent action, call outcome, and system event appends a new row. Nothing is ever overwritten here.

| Col | Field | Notes |
|---|---|---|
| 0 | Activity_ID | `ACT-XXXXXXXX` |
| 1 | Activity_DateTime | Full ISO timestamp |
| 2 | Customer_ID | |
| 3 | Customer_Name | |
| 4 | Agent_ID | Who performed the action |
| 5 | Action_Type | `Lead Captured`, `Lead Updated`, `Call Logged`, `Quick Edit`, `EasyPay Re-issued`, `Admin Override`, `Auto-Expiry` |
| 6 | Contact_Method | `Phone Call`, `Web Portal`, `System Cron`, etc. |
| 7 | Outcome | Last call result or status change reason |
| 8 | Customer_Status_After | Status value after the action |
| 9 | Promised_Payment_Date | |
| 10 | Next_Action | |
| 11 | Next_Action_Date | |
| 12 | Escalation_Flag | `False` for most entries; `True` if escalated |
| 13 | Escalation_Type | |
| 14 | Escalation_Reason | |
| 15 | Notes | Agent's free-text notes |
| 16 | Logged_By_Agent_ID | Always the session agent's ID |
| 17 | Logged_At | Timestamp |

### Agility REPORT Sheet

A manually pasted export from the external Agility ISP platform. Read by `runAgilitySync`. Columns are located by header name at runtime, not by fixed index.

| Header | Purpose |
|---|---|
| `Sync_Status` | Written to `Synced` after processing. Prevents duplicate imports. |
| `customer` | Customer's full name |
| `contractproductname` | Package/product name |
| `channel_partner_user_name` | Agent's name in Agility |
| Column 5 | Payment amount (non-empty = paid) |
| Column 10 | Description containing OVR/OVK order number |
| Column 11 | Activation status text |

---

## 5. Backend — Code.gs (Google Apps Script)

`Code.gs` (2,314 lines) is the **entire backend**. It is deployed as a Google Apps Script Web App at a single HTTPS URL.

### Top-Level Constants

```javascript
const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const ss = SpreadsheetApp.openById(SHEET_ID);                  // Main CRM database
const SUPPORT_SHEET_ID = '10JgMtPtvQp3...';                   // Support database (separate file)
```

> To update the Support database reference, change `SUPPORT_SHEET_ID` at the top of `Code.gs`.

### HTTP Entry Points

```javascript
function doPost(e) { ... }   // All data operations — the main API router
function doGet(e)  { ... }   // Health check: returns { status: 'active', system: 'FibreGems API' }
```

### The API Router (doPost)

Every frontend request arrives as:

```json
{
  "action": "handleLogin",
  "payload": { "email": "...", "password": "..." },
  "token": "uuid-session-token-or-null"
}
```

`doPost` routes on the `action` field via a `switch` statement. Before routing, it runs the **smart cache layer**:

1. **Cacheable reads** — If the action is in `cacheableActions`, it checks GAS `ScriptCache` for a stored response. Cache keys include a version hash + action name + token prefix + payload hash. Responses under 90 KB are cached for 5 minutes.
2. **Mutating writes** — If the action is in `mutatingActions`, it calls `incrementCacheVersion_()` which busts all cached reads by changing the version key, forcing fresh fetches on the next call.

All responses use this envelope:

```json
// Success
{ "status": "success", "data": { ... } }

// Error  
{ "status": "error", "message": "Human-readable error description" }
```

### Complete API Action Reference

| Action | Function | Auth Level | Description |
|---|---|---|---|
| `handleLogin` | `handleLogin(email, password)` | Public | Validate credentials, create session token |
| `handleAgentLeadUpdate` | `handleAgentLeadUpdate(existingId, formData, token)` | Any | New lead capture or existing lead update |
| `getAgentWorklist` | `getAgentWorklist(token, offset, limit)` | Any | Paginated list of agent's customers |
| `getAgentDailyQueue` | `getAgentDailyQueue(token)` | Any | Today's callbacks and new leads for agent |
| `logCallOutcome` | `logCallOutcome(token, payload)` | Any | Log a phone call result from the daily queue |
| `getAgentActivityLog` | `getAgentActivityLog(token, offset, limit)` | Any | Paginated activity history for agent |
| `quickUpdateSalesData` | `quickUpdateSalesData(customerId, data, token)` | Any | Fast status/next action update |
| `issueNewEasyPay` | `issueNewEasyPay(token, payload)` | Any | Issue a new EasyPay cycle (max 3 cycles) |
| `getAdminDashboard` | `getAdminDashboard(token)` | Admin | Agent stats, status breakdown for today |
| `getAdminMasterGrid` | `getAdminMasterGrid(token, offset, limit)` | Admin | Paginated view of all customers |
| `getAdminCallbackReport` | `getAdminCallbackReport(token, targetDate)` | Admin | Callback completion report and escalation monitor |
| `enforceLeadLifecycleRules` | `enforceLeadLifecycleRules(token)` | Admin | Run automated 42-day / 7-day / EasyPay expiry rules |
| `runAgilitySync` | `runAgilitySync(token)` | Admin | Import from Agility REPORT sheet |
| `getAgentList` | `getAgentList(token)` | Admin | List all user accounts |
| `createAgent` | `createAgent(token, payload)` | Admin | Create a new user account |
| `updateAgent` | `updateAgent(token, payload)` | Admin | Edit name, email, role, or status |
| `setAgentTempPassword` | `setAgentTempPassword(token, payload)` | Admin | Reset an agent's password |
| `deleteAgent` | `deleteAgent(token, agentId)` | Admin | Soft-delete (set status to Inactive) |
| `adminUpdateFollowUp` | `adminUpdateFollowUp(token, payload)` | Admin | Force-reschedule a callback, bypass 8-day rule |
| `getAdminPromisedPayments` | `getAdminPromisedPayments(token)` | Admin | All leads with upcoming promised payment dates |
| `getSupportDashboard` | `getSupportDashboard(token)` | Support+ | Stats from SADV + Infinifi support databases |
| `getSupportCustomers` | `getSupportCustomers(token)` | Support+ | Customer list from SADV + Infinifi |
| `getSupportTickets` | `getSupportTickets(token, payload)` | Support+ | Ticket list (combined SADV + Infinifi, sorted by date) |
| `logSupportTicket` | `logSupportTicket(token, payload)` | Support+ | Add a new ticket row to AUGSEP |
| `updateSupportTicket` | `updateSupportTicket(token, payload)` | Support+ | Update ticket status or append a note |
| `getAgilitySyncHistory` | `getAgilitySyncHistory(token)` | Support+ | (Stub — returns empty, not yet implemented) |
| `uploadAgilityReport` | `uploadAgilityReport(token, payload)` | Support+ | (Stub — not yet implemented) |

### Core Helper Functions

#### `hashPassword(password, salt)`
Uses `Utilities.computeDigest(SHA_256, password + salt)` and converts to a lowercase hex string. Passwords are **never stored in plain text**.

#### `getSessionUser(token)`
Searches `Daily_Logs` from bottom to top (most recent first, for speed) to find the matching token. Then looks up the user in `Users` to get `{ agentId, role, name }`. Throws `"Session expired. Please log in again."` if the token is not found.

#### `requireAdmin_(token)`
Calls `getSessionUser(token)` and throws if `role !== 'Admin'`. All admin-only functions call this first.

#### `requireSupport_(token)`
Same as above but allows `role === 'Support'` OR `role === 'Admin'`.

#### `validateFollowUpDate_(dateStr)`
Enforces the **8-day follow-up rule**: no next action date may be set more than 8 days in the future, and never in the past. Throws a descriptive error if violated. Exception: Activation Follow-Ups set automatically 7 days out are not subject to this check.

#### `formatDateSafe_(val)` and `addDaysSafe_(dateStr, numDays)`
Utility functions that safely handle both `Date` objects and `yyyy-MM-dd` string values from the spreadsheet, returning a consistent `yyyy-MM-dd` string format.

#### `generateReferralCode_()`
Returns a unique `REF-XXXXXX` code using a safe character set (no ambiguous characters like 0/O or 1/I).

---

## 6. Frontend Portals — HTML Pages

### index.html — Login Page (Root)

The only publicly accessible page. Contains a login form that calls `login()` from `auth.js`. On success, `routeView()` redirects based on role:
- `Admin` → `admin/index.html`
- `Support` → `support/index.html`
- Any other role (Agent) → `agent/index.html`

Visual features: animated floating particle background, glassmorphism card, password show/hide toggle, shimmer gradient.

### agent/index.html — Agent Portal

Has four tabs/views toggled by the navigation:

1. **Daily Queue** — The primary working view. Shows today's scheduled callbacks, overdue callbacks, and new leads captured today. Completed items move to the bottom. A progress bar shows completion percentage.
2. **Worklist** — Full paginated list of all the agent's active customers.
3. **New Lead** — Form to capture a new customer lead.
4. **Activity Log** — History of all this agent's logged call outcomes.

Key modals:
- **Quick Edit Modal** — Compact form for fast status + next action updates.
- **Duplicate Warning Modal** — Appears when the entered cell number matches an existing customer.
- **Call Outcome Modal** — Rich form for logging a phone call result from the Daily Queue.

### admin/index.html — Admin Portal

Has five views:

1. **Dashboard** — Stat cards (active agents today, total pipeline, touches today), agent activity table with pulse indicators, donut chart of status distribution.
2. **Callback Report** — Shows scheduled callbacks vs completed vs missed per agent for a chosen date. Lists missed callbacks and escalated leads.
3. **Master Grid** — Paginated table of all customers across all agents.
4. **Agility Sync** — Import button, results panel, and sync history.
5. **User Management** — Create, edit, reset password for, or deactivate agent accounts.

### support/index.html — Support Portal

Has three views:

1. **Dashboard** — Stats from both SADV and Infinifi support databases.
2. **Customers** — Combined customer list from both providers.
3. **Tickets** — Searchable table of all support tickets. Agents can log new tickets, update ticket status, and append timestamped notes.

---

## 7. Frontend JavaScript Modules

### js/api.js — API Client, Session Store, and Two-Tier Browser Cache

This is the **foundation module** loaded first on every page. Other modules depend on it.

**Key globals:**

| Variable | Purpose |
|---|---|
| `API_URL` | The deployed GAS Web App URL. **Only update this when you redeploy the backend.** |
| `session` | In-memory object: `{ token, role, name, agentId }`. Restored from `sessionStorage` on page load via IIFE. |
| `CACHEABLE_ACTIONS` | `Set` of read-only action names that can be cached. |
| `MUTATING_ACTIONS` | `Set` of write action names that must bust the cache. |

**Key functions:**

| Function | Purpose |
|---|---|
| `persistSession(data)` | Saves session to `sessionStorage` as `fg_session` (JSON) and to memory |
| `clearSession()` | Wipes memory, sessionStorage, and **all browser cache entries** |
| `callBackend(action, payload, opts)` | The universal fetch wrapper (see below) |
| `readCache_(key)` | Checks sessionStorage → localStorage in order |
| `writeCache_(key, data)` | Writes to both sessionStorage (1 min TTL) and localStorage (4 min TTL) |
| `clearAllCache_()` | Removes all entries with the `fg_cache_` prefix from both stores |

**How `callBackend` works (step by step):**

1. If action is in `CACHEABLE_ACTIONS` and `opts.skipCache` is not set, check the two-tier browser cache. Return cached data immediately if found (no network call).
2. Show the `global-loader` spinner element (if present in the DOM).
3. If action is in `MUTATING_ACTIONS`, call `clearAllCache_()` to bust stale reads.
4. Send `fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, payload, token }) })`.
5. On network error, throw a helpful message about CORS/deployment settings.
6. On non-200 HTTP status, throw with the status code.
7. Parse JSON response. If `result.status === 'error'`, throw the server's message.
8. On success, write response to browser cache if cacheable.
9. Return `result.data` directly to the caller.

### js/auth.js — Auth Guards, Routing, and UI Helpers

**Path helper:**

```javascript
function getRootPrefix_()
```
Returns `'../'` if the current page is inside a subfolder (`/admin/`, `/agent/`, `/support/`), or `''` if at the root. Used by all redirect calls so they work from any depth.

**Auth guards (call at the top of every protected page's `DOMContentLoaded`):**

| Function | Behaviour |
|---|---|
| `requireAuth()` | Redirects to `index.html` if `session.token` is missing |
| `requireAdmin()` | Calls `requireAuth()`, then blocks non-Admin roles |
| `requireSupport()` | Calls `requireAuth()`, then blocks roles that are not Support or Admin |

**Session and routing:**

| Function | Behaviour |
|---|---|
| `login()` | Reads form inputs, calls `handleLogin` via `callBackend`, saves session, calls `routeView()` |
| `logout()` | Calls `clearSession()` and redirects to `index.html` |
| `routeView()` | Redirects based on `session.role` |

**UI helpers:**

| Function | Behaviour |
|---|---|
| `show(id)` | Removes `hidden` class from element with given ID |
| `hide(id)` | Adds `hidden` class to element with given ID |
| `showToast(message, type)` | Creates a toast notification (success/error/info/warning). Auto-removes after 9 seconds with slide-out animation. |

### agent/agent.js — Agent Portal Logic

The largest frontend module. Handles all agent-facing interactions.

**Page state:**

| Variable | Purpose |
|---|---|
| `currentView` | Active view: `'queue'`, `'worklist'`, `'newlead'`, or `'activitylog'` |
| `worklistOffset` / `WORKLIST_LIMIT` | Pagination for the worklist (20 per page) |
| `actLogOffset` / `ACT_LOG_LIMIT` | Pagination for the activity log |
| `queueData` | Stores the daily queue response for use across the page |

**Key functions:**

| Function | Purpose |
|---|---|
| `switchView(view)` | Toggles between the four views, updates nav highlights |
| `loadDailyQueue()` | Fetches and renders today's callbacks and new leads, updates progress bar |
| `renderCallbackCard(item)` | Renders a single callback card with name, status, EasyPay badge, overdue badge |
| `openCallModal(item)` | Opens the Call Outcome modal pre-filled with customer data |
| `submitCallOutcome()` | Collects and validates the call modal form, calls `logCallOutcome` |
| `loadWorklist()` | Fetches and renders the paginated worklist table |
| `submitLead(overrideId)` | Collects form data, validates, calls `handleAgentLeadUpdate`. Handles duplicate alert by showing warning modal |
| `submitQuickEdit()` | Saves quick edit changes, closes modal, refreshes current view |
| `statusBadge(status)` | Returns a coloured HTML pill badge for a pipeline status |
| `escHtml(str)` | XSS-safe HTML insertion via a temp div's `textContent` |

### admin/admin.js — Admin Portal Logic

| Function | Purpose |
|---|---|
| `switchAdminView(view)` | Toggles between five admin views |
| `loadDashboard()` | Fetches dashboard data, draws donut chart via Canvas 2D API |
| `loadCallbackReport()` | Fetches and renders callback completion report for a chosen date |
| `loadMasterGrid()` | Fetches all customers with pagination |
| `triggerAgilitySync()` | Runs Agility import, shows results |
| `loadAgentList()` | Fetches user accounts and renders the management table |
| `createAgent()` / `updateAgent()` / `resetPassword()` / `deleteAgent()` | User CRUD operations |
| `renderStatusChart(statuses)` | Pure Canvas 2D donut chart — no external chart library |
| `adminStatusBadge(status)` | Same coloured pill badge as in agent.js |

### support/support.js — Support Portal Logic

| Function | Purpose |
|---|---|
| `loadSupportDashboard()` | Fetches stats from both SADV and Infinifi, renders stat cards |
| `loadCustomers()` | Combined customer list from both providers |
| `loadTickets()` | Loads and renders all tickets, combined and sorted by date |
| `openNewTicketModal()` / `submitTicket()` | Log a new SADV support ticket |
| `openUpdateModal(ticket)` / `submitTicketUpdate()` | Update ticket status or append a note |

---

## 8. Authentication, Roles, and Session Flow

### Login Flow

```
User submits email + password on index.html
        │
        ▼
auth.js: login()
        │  calls callBackend('handleLogin', { email, password })
        ▼
Code.gs: handleLogin()
  1. Search Users sheet for matching email (case-insensitive)
  2. Check Status === 'Verified'
  3. hashPassword(input, storedSalt) === storedHash?
  4. Generate UUID token
  5. appendRow to Daily_Logs (LogID, AgentID, Name, Date, Now, Now, token)
  6. Return { token, role, name, agentId }
        │
        ▼
api.js: persistSession({ token, role, name, agentId })
  → stored in sessionStorage as 'fg_session'
  → also held in memory as `session`
        │
        ▼
auth.js: routeView()
  → Admin   → admin/index.html
  → Support → support/index.html
  → Agent   → agent/index.html
```

### Session Lifetime

Sessions use `sessionStorage` which is **scoped to the browser tab**. Closing the tab destroys the session — no logout needed. Navigating between pages within the same tab preserves the session because `api.js` restores it from `sessionStorage` via an IIFE on every page load.

### Role-Based Access

| Guard | Where enforced |
|---|---|
| Frontend: `requireAuth()` | Top of every protected page's `DOMContentLoaded` |
| Frontend: `requireAdmin()` | `admin/index.html` page load |
| Frontend: `requireSupport()` | `support/index.html` page load |
| Backend: `requireAdmin_(token)` | Inside every admin-only function in `Code.gs` |
| Backend: `requireSupport_(token)` | Inside every support-only function in `Code.gs` |

---

## 9. Customer Lifecycle, Statuses, and Business Rules

### Pipeline Statuses

| Status | Meaning | Colour |
|---|---|---|
| New Lead | Just captured | Blue |
| Contacted | First contact made | Cyan |
| Contact Attempted | Called but no answer | Slate |
| Unable to Reach | Could not reach after attempts | Orange |
| Interested | Customer expressed interest | Emerald |
| Order Placed | Sale closed, order submitted | Indigo |
| Payment Pending | Awaiting payment | Amber |
| Payment Promised | Customer committed to a pay date | Yellow |
| Payment Received | Payment confirmed | Green |
| Activated | Service turned on | Purple |
| After-Sales Completed | 7-day follow-up done | Teal |
| Not Interested | Customer declined | Red |
| Lost (42-Day Expiry) | Auto-expired after 42 days | Grey |
| Lost (EasyPay 3 Cycles Expired) | All 3 EasyPay cycles used without payment | Grey |
| Cancelled | Manually cancelled | Grey |

### The 8-Day Follow-Up Rule

All next action dates set by agents (except Activation Follow-Ups) **cannot exceed 8 days from today**. This is enforced:
- **Backend**: `validateFollowUpDate_()` is called in `handleAgentLeadUpdate`, `logCallOutcome`, and `quickUpdateSalesData`.
- **Exception**: Admin can bypass this rule using `adminUpdateFollowUp` to force-reschedule missed callbacks.

### Same-Agent Duplicate Protection

When capturing a new lead, if the cell number already exists in CUSTOMERS:
- **Same agent**: A soft warning `{ duplicateAlert: true, existingId, existingName }` is returned. The agent can choose to update the existing record.
- **Different agent**: A hard block error is thrown: `"Block: This customer already exists in the company pipeline."` This prevents lead poaching.

### Automatic Status Transitions

`logCallOutcome` enforces these status transitions based on the logged outcome:

| Outcome logged | New Status set |
|---|---|
| Sale Won / Sale Completed | Order Placed |
| Activated / Customer Activated | Activated |
| Activation Follow-Up Completed | After-Sales Completed |
| Not Interested / Lost / Invalid Lead | Not Interested |
| Callback Rescheduled | Contact Attempted |
| No Answer / Voicemail | Unable to Reach |
| Payment Received | Payment Received |
| No Payment - Reschedule / New Payment Date | Payment Promised |
| Anything else | Contacted |

---

## 10. The Daily Queue Workflow (Agent Callback System)

The Daily Queue (`getAgentDailyQueue`) is the **most important agent feature**. It determines which customers an agent must call today.

### What appears in the queue?

A customer appears in the Daily Queue if ALL of the following are true:
1. They are assigned to the logged-in agent.
2. Their `Record_Status` is NOT `Archived` or `Expired`.
3. Their `Customer_Status` is NOT `Not Interested`, `Cancelled`, or `Closed`.

AND at least one of:
- `Next_Action_Date` is today or in the past (overdue callbacks).
- `Promised_Payment_Date` is today or in the past (payment follow-ups).
- `Created_DateTime` is today and status is not `Won` (new leads without a scheduled action yet).

### What is hidden?

- Future callbacks (`Next_Action_Date` is after today) are **hidden** unless the agent already completed a call on that customer today.
- If `Next_Action_Time` is set, the lead is hidden until **5 minutes before** the scheduled time.

### Sort order

Callbacks are sorted: **overdue first** (by most days overdue), then by scheduled time, **completed items last**.

### Queue stats returned

```json
{
  "todayStr": "2026-10-01",
  "callbacks": [ ... ],
  "newLeads": [ ... ],
  "stats": {
    "totalScheduled": 12,
    "completedToday": 7,
    "remainingToday": 5,
    "todayTouches": 15
  }
}
```

### Logging a Call Outcome

When an agent taps "Log Call" on a callback card, the `logCallOutcome` function:
1. Validates the 8-day rule for any rescheduled date.
2. Computes the new `Customer_Status` from the outcome (see table in Section 9).
3. Updates CUSTOMERS (status, next action, last contact date, last outcome).
4. If sale won: appends rows to ORDERS and PAYMENTS.
5. If activated: sets `Activation_Date`.
6. Resets the `Escalation_Flag` to `False` (contact occurred = no longer escalated).
7. Appends a row to ACTIVITY_LOG.
8. If a referral lead was submitted in the same call, calls `handleAgentLeadUpdate` recursively to create the referred customer.

---

## 11. EasyPay System

EasyPay is a payment collection method used by FibreGems where customers receive a reference number to pay at PayPoint/Shoprite/etc.

### Rules

| Rule | Detail |
|---|---|
| Maximum cycles | 3 (Cycle 1, Cycle 2, Cycle 3) |
| Validity per cycle | 14 days from issuance |
| Generation | **NEVER auto-generated.** Agents must manually enter the EasyPay number provided by the payment gateway during the sale or re-issue call. |
| Re-issue cap | If Cycle 3 of 3 has expired without payment, the customer is automatically marked `Lost (EasyPay 3 Cycles Expired)` and `Record_Status` is set to `Expired`. |

### EasyPay Re-Issue (`issueNewEasyPay`)

Called when a customer needs a new EasyPay number for their next cycle:
1. Reads current `EasyPay_Cycle` from CUSTOMERS.
2. Increments the cycle number (Cycle 1 → Cycle 2, etc.).
3. If already on Cycle 3 and expired, throws the max-cycle error.
4. Updates CUSTOMERS (new EasyPay number, cycle, expiry date, next action = Follow Up Payment).
5. Appends to ORDERS with the new cycle info.
6. Appends to ACTIVITY_LOG.

---

## 12. Referral System

Every customer is automatically assigned a unique `Referral_Code` (format: `REF-XXXXXX`) when their record is first created. This code can be given to friends/family to refer new customers.

### How referrals work

1. When capturing a new lead, the agent can enter the referrer's code in the `Referred_By_Code` field.
2. During lead creation in `handleAgentLeadUpdate`, the system finds the referrer's row in CUSTOMERS by matching `Referral_Code`.
3. The referrer's `Referral_Count` is incremented by 1.

### Referral during activation follow-up

When logging an `Activation Follow-Up Completed` outcome, the agent can optionally submit a referral lead (friend's name and number). `logCallOutcome` calls `handleAgentLeadUpdate` internally to create the referred customer, linking them via the referrer's code.

---

## 13. Lead Lifecycle Engine (Automated Rules)

`enforceLeadLifecycleRules(token)` is an **admin-only** function that runs through all active customers and applies automated business rules. It must be triggered manually by an admin (or can be set up as a time-driven trigger in Apps Script).

### Rule 1: EasyPay 3 Cycles Expired

**Condition:** `EasyPay_Cycle` contains `'Cycle 3'` AND `EasyPay_Expiry_Date` is in the past.

**Action:** Sets `Record_Status = 'Expired'` and `Customer_Status = 'Lost (EasyPay 3 Cycles Expired)'`.

### Rule 2: 42-Day Auto-Lost

**Condition:** Customer was created more than 42 days ago and has not won the sale.

**Action:** Sets `Record_Status = 'Expired'` and `Customer_Status = 'Lost (42-Day Expiry)'`.

### Rule 3: 7-Day Escalation

**Condition:** No contact recorded for 7 or more days (no `Last_Contact_Date`, or last contact was 7+ days ago).

**Action:** Sets `Escalation_Flag = 'TRUE'`:
- 7–13 days: `Escalation_Level = 'Level 2 - Supervisor Alert'`
- 14+ days: `Escalation_Level = 'Level 3 - Operations Escalation'`

### Admin Callback Report

`getAdminCallbackReport` (viewable in the Admin portal) shows:
- Per-agent completion rates for a chosen date.
- List of missed callbacks (scheduled but not contacted).
- List of escalated leads (7+ days without contact).

---

## 14. Agility Sync Engine

Agility is an external ISP management platform. It generates order reports containing OVR (residential) and OVK (business) order reference numbers. These reports are **manually pasted** into the `Agility REPORT` Google Sheet tab before running the sync.

### How `runAgilitySync` works

1. **Auth** — Admin token required.
2. **Find columns** — Reads the header row and locates `Sync_Status`, `customer`, `contractproductname`, `channel_partner_user_name` by name.
3. **Build lookup maps** — Reads all OVR and OVK numbers already in ORDERS into JavaScript `Map` objects. This prevents creating duplicate records for already-imported orders.
4. **Loop rows** — Skips rows already marked `Synced`.
5. **Extract order number** — Uses regex `/(OVR|OVK)-[A-Z0-9-]+/i` on column 10 (description field).
6. **Match or create:**
   - **Match found** in lookup map → `updatedLeads++` (no new record created).
   - **No match** → build new rows for CUSTOMERS, ORDERS, PAYMENTS, ACTIVATIONS in batch arrays.
7. **Mark Synced** — Updates the `Sync_Status` cell for each processed row.
8. **Batch write** — One `setValues()` call per sheet at the end. Much faster than row-by-row `appendRow`.
9. **Return** `{ success: true, newLeads, updatedLeads }`.

### Package mapping during sync

| `contractproductname` contains | CRM `Product_Package` value |
|---|---|
| `fttr-20-10` | Vuma Reach 20Mbps/10Mbps |
| `fttr-10-10` | Vuma Reach 10Mbps/10Mbps |
| Anything else | Other |

### Important notes

- EasyPay numbers are **never** auto-generated during Agility import. They are always left blank for the agent to enter after making contact.
- Imported customers have placeholder phone `0000000000` and `Address Missing` — the agent must update these fields.

---

## 15. Support Portal

The Support Portal reads from a **separate** Google Spreadsheet (the "Support DB"), identified by `SUPPORT_SHEET_ID` in `Code.gs`. It contains infrastructure ticket data from two ISP providers.

### SADV Tickets (AUGSEP sheet)

The `AUGSEP` sheet has 20 columns representing SADV (Vumatel/infrastructure provider) orders and tickets. Key columns (0-indexed):

| Col | Field |
|---|---|
| 0 | Created date |
| 1 | Completed date |
| 2 | Channel partner user name |
| 3 | Status |
| 5 | Product name |
| 6 | Description |
| 7 | Customer name |
| 8–16 | Update notes (1 through 9) |
| 17 | Ticket number |
| 19 | Order number |

### Infinifi Customers

The `Infinifi customers` sheet tracks Infinifi ISP orders. Status is inferred:
- If `Completed_Date` (col 1) is filled → `Active`
- If action type (col 11) is `preorder` or `pending` → `Pending`
- Otherwise → `Open`

### Ticket update rules

- When updating a SADV ticket to `Active` or `Complete`, the `Completed_Date` (col 1) is set to now.
- Notes are appended with a `[timestamp - agent]` prefix to cols 8–16 sequentially.
- The `LockService.getScriptLock()` is used to prevent concurrent write collisions.

---

## 16. Admin Agent Management

Admins can fully manage user accounts through the Admin portal's User Management view.

### Creating an agent

`createAgent(token, { name, email, password, role })`:
1. Checks for duplicate email.
2. Generates a unique `AGT-XXXXXXXX` Agent ID.
3. Creates a new salt UUID and hashes the password.
4. Appends a row to the Users sheet with `Status = Verified`.

### Editing an agent

`updateAgent(token, { agentId, name, email, role, status })`: Updates individual fields without touching credentials.

### Resetting a password

`setAgentTempPassword(token, { agentId, tempPassword })`:
1. Generates a new salt and re-hashes the new password.
2. Writes the new hash and salt to the Users sheet.
3. Stores the plaintext temp password in col 7 (visible to admins in the UI).
4. Ensures status is `Verified`.

### Deleting (deactivating) an agent

`deleteAgent(token, agentId)`: Sets `Status = 'Inactive'`. This is a **soft delete** — the row is never removed, and the agent cannot log in, but their customer records and audit trail are preserved.

---

## 17. Caching System (Two-Tier)

The system uses a two-tier cache to dramatically reduce cold-start latency from Google Apps Script's ~3–5 second startup time.

### Tier 1: GAS ScriptCache (Server-side)

- Stores JSON responses for up to 5 minutes.
- Cache key = `version_action_tokenPrefix_payloadHash`.
- Only caches responses under 90 KB (Apps Script limit is 100 KB per entry).
- Cache version is stored separately. Mutating actions call `incrementCacheVersion_()` which changes the version, effectively invalidating all existing cache keys.

### Tier 2: Browser Cache (Client-side)

- Implemented in `api.js` using `sessionStorage` (1 min TTL) and `localStorage` (4 min TTL).
- Keys are prefixed with `fg_cache_`.
- On a cache hit, the data is returned immediately with **zero network calls**.
- `sessionStorage` is checked first (fastest). On a miss, `localStorage` is checked and the entry is promoted to `sessionStorage` for faster subsequent access.
- Mutating actions call `clearAllCache_()` before making the network request, ensuring the next read fetches fresh data.

---

## 18. Security Model

| Concern | How it is handled |
|---|---|
| Password storage | SHA-256 hash with a per-user random UUID salt. Plaintext is never stored anywhere (except the admin-visible temp password field). |
| Session tokens | UUID generated server-side per login, stored in `Daily_Logs`. Sent in the request body — never in a cookie or URL. |
| Session lifetime | `sessionStorage` — automatically cleared when the tab closes. No server-side session management needed. |
| Role-based access control (frontend) | `requireAuth()`, `requireAdmin()`, `requireSupport()` guards at every page load. |
| Role-based access control (backend) | `requireAdmin_(token)` and `requireSupport_(token)` called at the top of every protected function. Agents cannot call admin-only actions even if they construct a request manually. |
| Agent data isolation | `getAgentWorklist` and `getAgentDailyQueue` filter by `Current_Owner_ID === session.agentId`. Agents cannot see or modify other agents' customers. |
| Cross-agent duplicate blocking | `handleAgentLeadUpdate` throws a hard block if the cell number matches a customer owned by a different agent. |
| XSS prevention | All user-supplied strings rendered into the DOM pass through `escHtml(str)` which uses a temporary div's `textContent` to safely encode HTML characters. |
| Concurrent write protection | `logSupportTicket` and `updateSupportTicket` use `LockService.getScriptLock()` to prevent race conditions on the Support DB. |

> **Deployment access note:** The GAS Web App must be deployed with **"Who has access: Anyone"** (not "Anyone with Google account") so the GitHub Pages frontend can reach it without requiring users to have a Google account. The application's own token system provides the access control.

---

## 19. CORS and Network Considerations

Google Apps Script Web Apps have a known CORS limitation.

**The problem:** If a request uses `Content-Type: application/json`, the browser sends a CORS preflight `OPTIONS` request first. Google Apps Script does not handle `OPTIONS` requests, causing the fetch to fail silently.

**The solution used in this project:** `api.js` sends all requests with `Content-Type: text/plain`. Browsers classify this as a "simple request" and **skip the preflight**. The body is still valid JSON — it is just labelled as plain text. The backend parses it with `JSON.parse(e.postData.contents)` regardless of the content-type header.

```javascript
// In api.js — this is intentional. Do NOT change it to 'application/json'.
headers: { 'Content-Type': 'text/plain' },
body: JSON.stringify({ action, payload, token })
```

**Debugging network errors:**

1. Open browser DevTools → Network tab. Look for the failing request to the Apps Script URL.
2. Check `API_URL` in `api.js` — is it the correct deployed URL?
3. Check the Apps Script deployment: **Execute as: Me**, **Who has access: Anyone**.
4. Go to Extensions → Apps Script → Executions to see any server-side errors.
5. If you see a 302 redirect in the network trace, the fetch is missing `redirect: 'follow'` (already set in `callBackend`).

---

## 20. How to Deploy / Make Changes

### Updating the Backend (Code.gs)

1. Open the linked Google Spreadsheet → **Extensions → Apps Script**.
2. Edit `Code.gs`.
3. Click **Deploy → Manage Deployments → Edit** (pencil icon on the existing deployment).
4. Change the version to **"New version"**, add a description, click **Deploy**.
5. The Web App URL does **not** change on version updates. You only need to copy a new URL if you create a brand-new deployment.
6. If you create a new deployment, update `API_URL` at the top of `js/api.js` and push to GitHub.

### Adding a New API Action

1. Write the function in `Code.gs`:
   ```javascript
   function myNewAction(token, payload) {
     const session = getSessionUser(token);  // validates auth
     // ... your logic ...
     return { result: 'value' };
   }
   ```
2. Add it to the `switch` in `doPost`:
   ```javascript
   case 'myNewAction':
     result = myNewAction(token, payload);
     break;
   ```
3. If it's a read, add `'myNewAction'` to `cacheableActions` in `doPost` AND to `CACHEABLE_ACTIONS` in `api.js`.
4. If it's a write, add `'myNewAction'` to `mutatingActions` in `doPost` AND to `MUTATING_ACTIONS` in `api.js`.
5. Call it from the frontend:
   ```javascript
   const result = await callBackend('myNewAction', { ...payload });
   ```
6. Redeploy the Web App (new version).

### Adding a New User

There is no self-registration. Admin creates accounts via the User Management view in the Admin portal, which calls `createAgent`. Alternatively, you can add a row manually to the Users sheet following the schema in Section 4.

### Initializing or Migrating the CUSTOMERS Sheet Headers

Run `extendDatabaseHeaders()` directly from the Apps Script editor (not via the API). This function creates or overwrites the header row with all 34 correct column names and applies bold formatting.

### Hosting the Frontend

The frontend is purely static files — no build step, no npm, no compilation.

- **GitHub Pages:** Push to the repository, enable Pages in repository Settings → Pages → Source: `main` branch, root folder. The site goes live at `https://yourusername.github.io/FibreGemsCRM/`.
- **Any other host:** Copy all files as-is. Ensure the server serves `index.html` from the root and that subfolder paths (`/agent/`, `/admin/`, `/support/`) resolve to their respective `index.html` files.

### Connecting a Different Support Database

Change the `SUPPORT_SHEET_ID` constant at the top of `Code.gs` to the Google Sheets file ID of the new support database. The file must be accessible by the Google account that runs the Apps Script Web App. Redeploy after changing.

