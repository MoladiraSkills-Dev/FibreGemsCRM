# FibreGems CRM — User Guide

> This guide is written for the people who use the system every day.
> No technical knowledge is required. Each section covers one role — find yours and follow along.

---

## Who Are You?

| I am a... | I go to... | My job in the CRM is... |
|---|---|---|
| **Sales Agent** | `agent/index.html` | Capture leads, call customers, track my pipeline |
| **Admin / Team Leader** | `admin/index.html` | Monitor agents, manage accounts, import data |
| **Support Staff** | `support/index.html` | Track and update ISP infrastructure tickets |

---

## Table of Contents

- [Logging In](#logging-in)
- [AGENT — Daily Workflow](#agent--daily-workflow)
  - [Your Daily Queue (Start Here Every Morning)](#your-daily-queue-start-here-every-morning)
  - [Logging a Call Outcome](#logging-a-call-outcome)
  - [Capturing a New Lead](#capturing-a-new-lead)
  - [The Worklist — Your Full Pipeline](#the-worklist--your-full-pipeline)
  - [Quick Edit](#quick-edit)
  - [Activity Log](#activity-log)
  - [EasyPay Re-Issue](#easypay-re-issue)
  - [The Referral System](#the-referral-system)
- [ADMIN — Daily Workflow](#admin--daily-workflow)
  - [Dashboard — The Morning Overview](#dashboard--the-morning-overview)
  - [Callback Report — Accountability Monitor](#callback-report--accountability-monitor)
  - [Master Grid — See Every Customer](#master-grid--see-every-customer)
  - [Agility Sync — Importing Leads](#agility-sync--importing-leads)
  - [User Management — Managing Agents](#user-management--managing-agents)
- [SUPPORT — Daily Workflow](#support--daily-workflow)
  - [Dashboard — Overview](#dashboard--overview)
  - [Tickets — The Main Working View](#tickets--the-main-working-view)
  - [Customers — The Customer List](#customers--the-customer-list)
- [Rules Everyone Must Know](#rules-everyone-must-know)
- [Common Questions](#common-questions)

---

## Logging In

1. Open your browser and go to the FibreGems CRM website.
2. Enter your **email address** and **password**.
3. Click **Log In**.
4. The system will automatically take you to the right portal based on your role.

> **Important:** Your session is tied to the browser tab you logged in from. If you close the tab, you will need to log in again. You can stay logged in for as long as the tab is open.

---

---

# AGENT — Daily Workflow

As a Sales Agent, your job is to work through your pipeline every day — calling customers, capturing new leads, and keeping statuses up to date.

---

## Your Daily Queue (Start Here Every Morning)

The **Daily Queue** is the first thing you should open every morning. It shows you exactly who you need to call today.

**How to get there:** Click the **"Daily Queue"** tab in the navigation at the top of your Agent portal.

### What you will see:

**Progress Bar** — Shows how many of today's callbacks you have completed vs how many are left. Aim to get this to 100% before end of day.

**Today's Callbacks** — These are customers who:
- Have a scheduled follow-up set for today.
- Are overdue for a callback from a previous day (shown with a red "Overdue" badge).
- Have a promised payment date that is today or past.

**New Leads** — Customers captured today who don't have a scheduled action yet.

### Reading a callback card:

Each callback card shows:
- **Customer name and phone number**
- **Current status** (e.g., Order Placed, Payment Promised)
- **What you need to do** (Next Action)
- **EasyPay badge** — If the customer has an EasyPay number, it shows the cycle (Cycle 1/2/3) and days remaining until it expires. A red "EXPIRED" badge means the EasyPay has expired.
- **"Overdue" badge** — Red badge showing how many days the callback is overdue.
- **Greyed out card** — Means you already completed this call today.

### Timed callbacks:
If a callback is scheduled for a specific time (e.g., 2:30 PM), it will only appear on your queue **5 minutes before** that time. This keeps your queue clean and only shows what's relevant right now.

---

## Logging a Call Outcome

After every phone call, you **must** log the outcome. This keeps your pipeline accurate and ensures the system knows the customer has been contacted.

**How to log a call:**
1. Find the customer in your Daily Queue.
2. Click the **"Log Call"** button on their card.
3. A form will appear. Fill in:

| Field | What to enter |
|---|---|
| **Call Outcome** | What happened on the call (see outcomes below) |
| **Notes** | Optional: any extra details about the conversation |
| **Next Callback Date** | When to follow up again (cannot be more than 8 days from today) |
| **Next Callback Time** | Optional: specific time for the callback |

4. Click **Submit**.

### Available call outcomes:

| Outcome | What it means | Status it sets |
|---|---|---|
| Sale Won / Sale Completed | Customer agreed, order placed | Order Placed |
| Activated / Customer Activated | Service has been switched on | Activated |
| Activation Follow-Up Completed | 7-day check-in done | After-Sales Completed |
| Not Interested / Invalid Lead | Customer said no | Not Interested |
| Callback Rescheduled | Customer asked to call back | Contact Attempted |
| No Answer / Voicemail | Customer did not pick up | Unable to Reach |
| Payment Received | Customer has paid | Payment Received |
| No Payment - Reschedule | Customer promised to pay but hasn't yet | Payment Promised |

### When you log "Sale Won":
Two extra fields appear:
- **Order Number** — Enter the OVR or OVK number (e.g., `OVR-123456`). This must be entered manually — it is never generated automatically.
- **EasyPay Number** — Enter the EasyPay reference number from the payment gateway. Also entered manually. Leave blank if payment type is not EasyPay.

### Referral during Activation Follow-Up:
When logging an **Activation Follow-Up Completed** outcome, a referral section appears. If the activated customer gives you a friend or family member's details who might want fibre, fill in their name and number. The system will automatically create a new lead linked to the referrer.

---

## Capturing a New Lead

Use this when you are signing up a brand new customer who has never been in the system before.

**How to get there:** Click **"New Lead"** in the top navigation.

**Step-by-step:**

1. Fill in the customer's personal details:
   - First name and surname
   - Cell number (required — used to check for duplicates)
   - Alternate cell, email, address, suburb (optional but recommended)

2. Fill in the sales details:
   - Package (e.g., Vuma Reach 20Mbps/10Mbps)
   - Payment type (Prepaid, Debit Order, EasyPay)
   - Current status (usually "New Lead" for a fresh capture)
   - Next action and next action date

3. If the customer was **referred by an existing customer**, enter the referrer's code in the **"Referred By Code"** field (format: `REF-XXXXXX`).

4. Click **Submit Lead**.

### Duplicate warning:
If the cell number you entered already exists in the system:
- **If it's your own customer** — A warning appears asking if you want to update the existing record. Click "Update Existing" to continue with that customer's record instead.
- **If it belongs to another agent** — A hard block message appears. You cannot capture this lead because it already belongs to someone else in the pipeline.

---

## The Worklist — Your Full Pipeline

The Worklist shows **all your active customers** in one place, newest first.

**How to get there:** Click **"Worklist"** in the top navigation.

### What the columns mean:

| Column | Meaning |
|---|---|
| Name | Customer's full name |
| Cell | Phone number |
| Package | The fibre package they are on |
| Status | Current pipeline status |
| Next Action | What you need to do next |
| Next Action Date | When to do it |
| Last Contact | When you last spoke to them |
| Last Outcome | What happened on your last call |

### Editing from the worklist:
Hover over a row and click the **Edit** button to open the **Quick Edit** panel, or click the customer's name to open the full lead form.

---

## Quick Edit

Quick Edit lets you update a customer's status and next action without opening their full record. Use this for fast updates.

**How to use it:**
1. From the Worklist, hover over a row and click **Edit**.
2. Update the package, status, next action, and/or next action date.
3. Click **Save**.

> **Remember:** The next action date cannot be more than 8 days from today. If you try to set a date further out, the system will block it.

---

## Activity Log

Your Activity Log is a history of every call and update you have logged. Use it to review past outcomes, remind yourself what was discussed, or check when you last contacted a customer.

**How to get there:** Click **"Activity Log"** in the top navigation.

The log is sorted newest first and shows:
- Date and time of the action
- Customer name
- What type of action it was (Call Logged, Lead Captured, etc.)
- The outcome
- Status after the action
- Your notes

---

## EasyPay Re-Issue

If a customer's EasyPay number has expired and they still haven't paid, you can issue them a new EasyPay number for the next cycle.

**Rules:**
- Maximum of **3 EasyPay cycles** per customer.
- Each EasyPay number is valid for **14 days**.
- If Cycle 3 expires without payment, the customer is automatically marked as **Lost** and cannot be recovered.

**How to re-issue:**
1. Open the customer's record from the Worklist.
2. Click the **"Re-issue EasyPay"** button.
3. Enter the new EasyPay number provided by the payment gateway.
4. Optionally update the Order Number.
5. Click **Submit**.

The system will automatically advance the cycle (e.g., from Cycle 1 to Cycle 2) and set a new 14-day expiry.

---

## The Referral System

Every customer you capture receives a unique **Referral Code** (format: `REF-XXXXXX`). This code can be shared with their friends and family.

**How it works:**
- When capturing a new lead, enter the referrer's code in the **"Referred By Code"** field.
- The system links the new lead to the referrer.
- The referrer's **Referral Count** is automatically incremented in the system.

**Where to find a customer's referral code:**
- It is visible on their callback card in the Daily Queue.
- It is also visible on their record in the Worklist.

---

---

# ADMIN — Daily Workflow

As an Admin, your job is to oversee the entire sales operation — monitoring agent performance, ensuring callbacks are being completed, managing data imports, and keeping the system running smoothly.

---

## Dashboard — The Morning Overview

The Dashboard is your starting point every morning. It gives you a live snapshot of what is happening across the entire team.

**How to get there:** Click **"Dashboard"** in the top navigation.

### What you will see:

**Stat Cards (top row):**

| Card | What it tells you |
|---|---|
| Active Agents Today | How many agents have logged at least one action today |
| Total Customers | Total active customers across all agents |
| Total Touches Today | Total number of calls and updates logged across the whole team today |

**Agent Activity Table:**
A live list of every agent who has been active today, showing:
- Their name
- How many actions (touches) they have logged today
- When they were last active (green pulse = active recently)

Use this to quickly see who is working and who is quiet.

**Pipeline Status Chart:**
A donut chart showing the breakdown of all customers by their current status. Use this to understand the health of the pipeline at a glance — how many are new leads, how many are at order stage, how many are activated, etc.

---

## Callback Report — Accountability Monitor

The Callback Report shows you whether agents are completing their scheduled callbacks. This is your primary accountability tool.

**How to get there:** Click **"Callback Report"** in the top navigation.

**How to use it:**
1. Select a date (defaults to today).
2. Click **"Run Report"**.

### What you will see:

**Agent Completion Table:**
Shows per agent for the selected date:

| Column | What it means |
|---|---|
| Agent | Agent's name |
| Scheduled | How many callbacks were due that day |
| Completed | How many they actually called |
| Missed | How many they didn't call |
| Completion Rate | Percentage completed (aim for 100%) |

**Missed Callbacks List:**
Customers who were scheduled to be called on the selected date but were not contacted. Shows the customer name, agent responsible, how many days overdue, and the last recorded outcome.

**Escalated Leads List:**
Customers who have not been contacted for **7 or more days**. These are serious — they represent leads at risk of going cold or being lost.

- **Level 2 — Supervisor Alert:** 7–13 days without contact.
- **Level 3 — Operations Escalation:** 14+ days without contact.

**Admin Override:**
If a callback was missed, you can force-reschedule it directly from this report. Click the **reschedule button** on a missed callback, enter a new date, and optionally reassign it to a different agent. Admins are not subject to the 8-day rule — you can schedule further out if needed.

---

## Master Grid — See Every Customer

The Master Grid shows every customer in the entire system across all agents. Use it to search, filter, audit, monitor pipeline health, and identify and delete duplicate clients.

**How to get there:** Click **"Master Grid"** in the sidebar navigation.

### Searching & Filtering Clients:
1. **Live Search Bar**: Type any part of a customer's name, primary or alternate cell number, email, order number, EasyPay number, referral code, address/suburb, or assigned agent.
2. **Filters**:
   - **Pipeline Status**: Filter by specific stage (e.g., *New Lead*, *Callback Scheduled*, *Pitch Complete*, *Active*, *Escalated*, *Duplicate*).
   - **Assigned Agent**: View leads owned by a specific agent or view *Unassigned* leads.
   - **Payment & EasyPay**: Filter by *Paid*, *Pending*, *Expired EasyPay (14d)*, or *Promised Payment*.
   - **Duplicates**: Filter to show *⚠️ Potential Duplicates Only*, *🗑️ Marked Duplicates*, or *✨ Unique Records*.
   - **Date Range**: Filter by *Today*, *Yesterday*, *Last 7 Days*, *Last 30 Days*, or set a *Custom Date Range*.
3. **Quick Stat Pills**: 1-click filter buttons at the top of the table for instant access to *All*, *Duplicates*, *Expired EasyPay*, *Promised Payments*, and *7d+ Escalations*.
4. **Column Sorting**: Click any column header (Customer, Phone, Agent, Order Date, EasyPay Expiry, Status, Payment) to sort ascending or descending.
5. **Export CSV**: Click **"Export CSV"** to download the current filtered view into a spreadsheet.

### Finding & Deleting Duplicate Clients:

1. **Automatic Duplicate Detection**:
   - The system automatically detects potential duplicate accounts matching on normalized **Primary Cell Number**, **Email Address**, or **Order Number**.
   - Duplicates are tagged directly in the grid with a warning badge (`⚠️ Dup`).
2. **Find & Clean Duplicates Tool**:
   - Click **"🔍 Find & Clean Duplicates"** at the top right of the Master Grid.
   - The Duplicate Manager modal displays all matching records grouped side-by-side.
   - The system highlights the recommended **★ Primary (Keep)** record and candidate duplicates.
   - Click **"Select All Secondary Records"** or select individual duplicates via checkbox.
   - Click **"🏷️ Soft-Delete (Mark Duplicate)"** to set the record to *Duplicate / Inactive* (removes from agent queues, keeps audit trail).
   - Or click **"🗑️ Permanently Delete"** to purge the duplicate row completely.
3. **Deleting Individual Clients / Duplicates**:
   - On any table row or from inside the Customer Details modal, click the **🗑️ Delete / Mark Duplicate** button.
   - Choose between **Soft Delete (Mark as Duplicate)** or **Permanent Hard Purge**, enter an optional reason note, and confirm.

---

## Agility Sync — Importing Leads

The Agility Sync imports customer and order data from the **Agility ISP platform** directly into the CRM. You run this whenever a new Agility report needs to be imported.

**Before you run the sync:**
1. Export the report from the Agility platform.
2. Open the linked Google Spreadsheet.
3. Paste the exported data into the tab named **"Agility REPORT"**.
4. Make sure the first row contains the correct column headers (especially `Sync_Status`, `customer`, `contractproductname`, `channel_partner_user_name`).

**Running the sync:**
1. Click **"Agility Sync"** in the top navigation.
2. Click the **"Run Agility Sync"** button.
3. Wait for the results panel to appear.

**What the results mean:**

| Result | What happened |
|---|---|
| New Leads Created | Brand new customers added to the CRM from the Agility report |
| Existing Orders Matched | Orders that were already in the system — no duplicate created |

**Important notes:**
- Each row in the Agility REPORT is marked "Synced" after processing. Running the sync again on the same data will skip those rows — no duplicates.
- Imported customers will have `0000000000` as their phone number and `Address Missing` as their address. Agents must update these fields when they make contact.
- EasyPay numbers are **never** imported automatically — agents must enter them manually after contact.

---

## User Management — Managing Agents

You can create, edit, reset passwords for, and deactivate agent accounts directly from the Admin portal.

**How to get there:** Click **"User Management"** in the top navigation.

### Creating a new agent:

1. Click **"Add New Agent"**.
2. Fill in:
   - Full name
   - Email address
   - Temporary password
   - Role (Agent, Admin, or Support)
3. Click **Create**.

The new agent can log in immediately with the credentials you set.

### Editing an agent:

1. Find the agent in the table.
2. Click the **Edit** button.
3. Update their name, email, role, or status.
4. Click **Save**.

### Resetting a password:

1. Find the agent in the table.
2. Click **"Reset Password"**.
3. Enter a new temporary password.
4. Click **Submit**.

The agent can log in with the new password immediately. The temp password is visible to admins in the table so you can communicate it to the agent.

### Deactivating an agent:

1. Find the agent in the table.
2. Click **"Deactivate"**.

The agent's account is immediately blocked — they cannot log in. Their customer records and call history are preserved in the system.

> **Note:** You cannot permanently delete an agent or their data. Deactivating sets their status to "Inactive".

---

---

# SUPPORT — Daily Workflow

As a Support staff member, your job is to track and manage infrastructure tickets from two ISP providers — **SADV** (Vumatel) and **Infinifi**. You work from the Support Portal.

---

## Dashboard — Overview

The Dashboard gives you a quick summary of the current state of infrastructure tickets across both providers.

**How to get there:** Click **"Dashboard"** in the top navigation of the Support portal.

### What you will see:

**Summary Stats:**

| Stat | What it means |
|---|---|
| Total Active | Customers with active/completed service across both providers |
| Total Inactive | Cancelled or expired accounts |
| Open Tickets | Tickets with no resolved status |

**SADV Stats (left panel):**
- Active connections
- Inactive connections
- Pending/scheduled connections
- Open (unresolved) tickets

**Infinifi Stats (right panel):**
- Active connections (completed date is filled)
- Pending (preorder or in-progress)
- Open tickets

**Recent Tickets:**
The 5 most recently created tickets are shown at the bottom for quick access.

---

## Tickets — The Main Working View

The Tickets view is where you spend most of your time. It shows all tickets from both SADV and Infinifi, sorted by newest first.

**How to get there:** Click **"Tickets"** in the top navigation.

### Searching and filtering:
Use the search bar at the top to filter tickets by customer name, ticket number, order number, or description.

### What each ticket shows:

| Field | What it means |
|---|---|
| Provider | SADV or Infinifi |
| Ticket # | Reference number for the ticket |
| Customer | Customer's name |
| Status | Current status (Active, Pending, Open, etc.) |
| Product | The service or package |
| Created Date | When the ticket was opened |
| Completed Date | When it was resolved (blank = still open) |
| Description | Description of the issue or order |
| Updates | Notes added by the team over time |

### Logging a new ticket (SADV only):

1. Click **"Log New Ticket"**.
2. Fill in:
   - Customer name
   - Ticket number (from the SADV system)
   - Order number
   - Product/package
   - Description of the issue
   - Status (default: Open)
3. Click **Submit**.

### Updating a ticket:

1. Find the ticket in the table.
2. Click the **"Update"** button.
3. You can:
   - Change the status (e.g., from Pending to Active)
   - Add a note (appears as a timestamped entry with your name)
4. Click **Submit**.

**Note format for updates:**
`[date/time - your name] Your note here`

Each note is added to the ticket without overwriting previous notes. Up to 9 note slots are available per SADV ticket.

**Closing a ticket:**
Change the status to **"Active"** or **"Complete"** and the system will automatically fill in the **Completed Date** to today.

---

## Customers — The Customer List

The Customers view shows a combined list of all customers across both SADV and Infinifi.

**How to get there:** Click **"Customers"** in the top navigation.

Each customer record shows:
- Customer name
- Provider (SADV or Infinifi)
- Status
- Product/package
- Order/Lead number
- Created date
- Completed/activation date (if applicable)

This view is useful for quickly checking whether a specific customer is active in the system and who their provider is.

---

---

# Rules Everyone Must Know

These rules apply across the whole system regardless of your role.

### 1. The 8-Day Follow-Up Rule

**Agents cannot schedule a next callback more than 8 days in the future.**

This keeps the pipeline moving. If a customer says "call me in 3 weeks," set the callback for 8 days out — the maximum allowed. When you call on that date, you can reschedule again for another 8 days if needed.

Admins can override this rule when rescheduling on behalf of agents.

### 2. The 42-Day Auto-Expiry Rule

**Any lead that has been open for more than 42 days without winning the sale is automatically marked as "Lost (42-Day Expiry)"** and removed from agent queues.

This keeps the pipeline clean and focused on active opportunities.

### 3. The EasyPay 3-Cycle Limit

**Each customer can receive a maximum of 3 EasyPay numbers.** If Cycle 3 expires without payment, the customer is automatically marked as **"Lost (EasyPay 3 Cycles Expired)"** and cannot be recovered.

### 4. Never Share Your Login

Your session token is unique to you. Do not share your login details with colleagues. Each person must have their own account.

### 5. Log Every Call

The system's accuracy depends on every call being logged. If you call a customer but do not log the outcome, the system will treat them as uncontacted and escalate the lead as a missed callback.

### 6. EasyPay Numbers Are Always Entered Manually

EasyPay numbers come from the payment gateway. The system **never** generates them automatically. You must enter the exact number provided to you after processing a payment.

---

---

# Common Questions

**Q: I closed my browser tab and now I have to log in again — is this normal?**
Yes. The system uses your browser tab to hold your session for security. Closing the tab ends your session automatically.

**Q: I tried to capture a lead but got a message saying "This customer already exists in the pipeline." What do I do?**
Another agent has already captured this customer. You cannot take over their lead. If you believe this is an error, contact your admin.

**Q: I tried to set a callback date 2 weeks from now but got an error. Why?**
The system has an 8-day maximum follow-up rule. Set the callback for 8 days out — the furthest allowed. If you genuinely need longer, ask your admin to override it.

**Q: The Daily Queue is empty even though I know I have callbacks due. What do I check?**
- Make sure you are on the **"Daily Queue"** tab (not Worklist).
- Check that the next action date on those customers is set to today or earlier.
- If it is set to a future date, it will not appear until that date.

**Q: A customer says they paid but their status still shows "Payment Pending." What do I do?**
Log a call outcome of **"Payment Received"** for that customer. This will update their status to Payment Received.

**Q: I issued a wrong EasyPay number. Can I fix it?**
Open the customer from the Worklist, click "Re-issue EasyPay," enter the correct number, and submit. This will advance to the next cycle. Note that this uses up one of the 3 cycles.

**Q: Where can I see the full history of everything that happened with a customer?**
In your Activity Log (agent portal). Every call outcome, lead update, and quick edit is recorded there with a timestamp.

**Q: As an admin, how do I assign a missed callback to a different agent?**
Go to the **Callback Report**, find the missed callback, click **Reschedule**, and use the "Reassign to Agent" dropdown to select a different agent before saving.

**Q: A customer's EasyPay has expired (Cycle 3). Can anything be done?**
No. Once the third EasyPay cycle expires without payment, the record is automatically marked as Lost and locked. The customer would need to be re-captured as a brand new lead if they decide to continue.

