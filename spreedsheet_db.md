# Fibre Gems Ecosystem: Master Database & System Context Specification

This document serves as the master prompt engineering context file for the Fibre Gems custom CRM ecosystem. It defines the complete relational database architecture derived directly from the active Fibre Gems test environment, establishing structured table relationships, business rules, and technical parameters for AI coding assistants.

---

## 1. System Overview & Architecture
* **Project Name:** Fibre Gems Custom CRM Ecosystem
* **Core Objective:** Provide a self-hosted, scalable operational platform replacing legacy spreadsheet tracking and third-party dependencies with a unified PostgreSQL database, FastAPI backend, WhatsApp chatbot intake, and call center management tools.
* **Hosting Environment:** AWS RDS PostgreSQL (`af-south-1` Cape Town region) ensuring complete data ownership and POPIA compliance.

---

## 2. Relational Database Schema Specification (PostgreSQL)

### A. Users Table (`Users`)
Manages system access, administrative controls, agent credentials, and role-based permissions.
* **`Agent_ID`** (VARCHAR, Primary Key) – Unique identifier for staff (e.g., `AGT-BA4CF56E`, `ADM-9C292BA6`).
* **`Full_Name`** (VARCHAR) – Staff member's legal name.
* **`Email`** (VARCHAR) – Corporate or user email address.
* **`Password_Hash`** (VARCHAR) – Secure salted password hash.
* **`Salt`** (VARCHAR) – Cryptographic salt value.
* **`Role`** (VARCHAR) – Access tier (`Admin`, `Agent`, `Team Leader`).
* **`Status`** (VARCHAR) – Account validation status (`Verified`, `Pending`, `Suspended`).
* **`Verification_Token`** (VARCHAR, Nullable) – Token for account verification.
* **`OTP`** (VARCHAR, Nullable) – One-Time Password for authentication.
* **`OTP_Expiry`** (TIMESTAMP, Nullable) – Expiration timestamp for active OTP.
* **`Created_At`** (TIMESTAMP) – Record creation timestamp.

### B. Customers Table (`CUSTOMERS`)
Stores core client demographic profiles, address data, product packages, and pipeline states.
* **`Customer_ID`** (VARCHAR, Primary Key) – Unique customer identifier (e.g., `CUS-7AA34DF4`).
* **`Record_Status`** (VARCHAR) – System record state (`Active`, `Archived`).
* **`Created_DateTime`** (TIMESTAMP) – Intake timestamp.
* **`Agent_Name`** (VARCHAR) – Name of the agent managing the record.
* **`Last_Updated_DateTime`** (TIMESTAMP) – Last modification timestamp.
* **`Full_Name`** (VARCHAR) – Customer's full name.
* **`Cell_Number`** (VARCHAR) – Primary mobile contact number.
* **`Alternate_Cell_Number`** (VARCHAR, Nullable) – Secondary contact number.
* **`Email`** (VARCHAR, Nullable) – Customer email address.
* **`Full_Address`** (TEXT) – Physical street address.
* **`Area_Suburb`** (VARCHAR) – Suburb or region.
* **`Product_Package`** (VARCHAR) – Selected fibre package (e.g., `Vuma Reach 10Mbps/10Mbps`, `Vuma Reach 20Mbps/10Mbps`).
* **`Payment_Type`** (VARCHAR) – Billing method (`Prepaid`, `Debit Order`, `EasyPay`).
* **`Order_Date`** (DATE) – Date order was placed.
* **`Current_Owner_ID`** (VARCHAR) – Foreign key linking to assigned agent.
* **`Team_Leader_ID`** (VARCHAR, Nullable) – Supervisor oversight identifier.
* **`Customer_Status`** (VARCHAR) – Pipeline stage (`New Lead`, `Contacted`, `Order Placed`, `Activated`, `Payment Pending`).
* **`Next_Action`** (VARCHAR) – Scheduled follow-up task (`Initial Call`, `Easypay Reminder`, `Payment Follow-Up`).
* **`Next_Action_Date`** (DATE) – Target date for next action.
* **`Last_Contact_Date`** (DATE) – Timestamp of last client interaction.
* **`Order_Number`** (VARCHAR, Nullable) – Associated order reference.
* **`EasyPay_Number`** (VARCHAR, Nullable) – EasyPay account number for billing.
* **`EasyPay_Cycle`** (VARCHAR, Nullable) – EasyPay billing cycle phase.
* **`Referral_Code`** (VARCHAR, Nullable) – Client's unique referral code.
* **`Referred_By_Code`** (VARCHAR, Nullable) – Referral code of referring client.
* **`EasyPay_Expiry_Date`** (DATE, Nullable) – Expiration date for the EasyPay cycle.
* **`Activation_Date`** (DATE, Nullable) – Date the service was activated.
* **`Promised_Payment_Date`** (DATE, Nullable) – Date client promised to pay.
* **`Escalation_Flag`** (VARCHAR, Nullable) – True/False indicator of escalation.
* **`Escalation_Level`** (VARCHAR, Nullable) – Escalation severity level.
* **`Escalation_Reason`** (TEXT, Nullable) – Reason for escalation.
* **`Last_Outcome`** (VARCHAR, Nullable) – Result of the last recorded interaction.
* **`Referral_Count`** (INTEGER, Default 0) – Number of new leads this customer has successfully referred to an agent. Auto-incremented each time a new lead is captured using this customer's `Referral_Code`.
* **`Next_Action_Time`** (VARCHAR, Nullable) – The scheduled time for a same-day call back (e.g., '14:30'). Lead will appear on agent's dashboard 5 minutes prior to this time.

### C. Orders Table (`ORDERS`)
Tracks infrastructure order numbers and SADV/Vumatel fulfillment mapping.
* **`Order_ID`** (VARCHAR, Primary Key) – Unique order identifier (`ORD-440f4629`).
* **`Customer_ID`** (VARCHAR, Foreign Key) – Links to `CUSTOMERS`.
* **`Customer_Name`** (VARCHAR) – Client name.
* **`Order_Date`** (DATE) – Date order was submitted.
* **`SADV_OVR_Number`** (VARCHAR, Nullable) – SADV order reference.
* **`SADV_OVK_Number`** (VARCHAR, Nullable) – SADV tracking reference.
* **`Agent_Name`** (VARCHAR) – Associated sales agent.
* **`Order_Status`** (VARCHAR) – Fulfillment status (`Pending`, `Order Placed`, `Completed`, `Cancelled`).
* **`Next_Action`** (VARCHAR) – Next operational step.
* **`Action_Date`** (DATE) – Target action date.
* **`Source`** (VARCHAR) – Lead channel origin (`WhatsApp`, `XDS Bureau`, `Facebook Ad`).

### D. Payments Table (`PAYMENTS`)
Tracks financial transactions and payment verification lifecycles.
* **`Payment_ID`** (VARCHAR, Primary Key) – Unique transaction identifier (`PAY-3dea7323`).
* **`Customer_ID`** (VARCHAR, Foreign Key) – Links to `CUSTOMERS`.
* **`Payment_Status`** (VARCHAR) – Status state (`Pending`, `Paid`, `Failed`, `Expired`).
* **`Promised_Payment_Date`** (DATE, Nullable) – Client commitment date for payment.
* **`Payment_Date`** (DATE, Nullable) – Actual date payment was received.
* **`Payment_Verified_Date`** (TIMESTAMP, Nullable) – Date finance team verified the transaction.

### E. Activations Table (`ACTIVATIONS`)
Tracks network installation and line activation milestones.
* **`Activation_ID`** (VARCHAR, Primary Key) – Unique activation reference (`ACT-e65ceeb6`).
* **`Customer_ID`** (VARCHAR, Foreign Key) – Links to `CUSTOMERS`.
* **`Activation_Status`** (VARCHAR) – Installation status (`Pending`, `Activated`, `Cancelled`, `Not Ready`).
* **`Activation_Date`** (DATE, Nullable) – Date line went live.
* **`Activation_Verified_Date`** (TIMESTAMP, Nullable) – Date activation was confirmed by network supplier.

### F. Activity Log Table (`ACTIVITY_LOG`)
Maintains a complete historical audit trail of all agent actions, customer communications, and pipeline state changes.
* **`Activity_ID`** (VARCHAR, Primary Key) – Unique log identifier (`ACT-1B1BA6B7`).
* **`Activity_DateTime`** (TIMESTAMP) – Exact time of action.
* **`Customer_ID`** (VARCHAR, Foreign Key) – Links to `CUSTOMERS`.
* **`Customer_Name`** (VARCHAR) – Client name.
* **`Agent_ID`** (VARCHAR) – Acting staff member.
* **`Action_Type`** (VARCHAR) – Type of operation (`Lead Update`, `System Generation`, `Status Change`).
* **`Contact_Method`** (VARCHAR) – Communication channel (`WhatsApp`, `Call`, `SMS`, `Email`, `Other`).
* **`Outcome`** (VARCHAR) – Result of interaction (`Payment Date Given`, `Customer Says Paid`, `Could Not Reach`).
* **`Customer_Status_After`** (VARCHAR) – Pipeline state following interaction (`Order Placed`, `Activated`, `Payment Pending`, `New Lead`).
* **`Promised_Payment_Date`** (DATE, Nullable) – Recorded payment commitment date.
* **`Next_Action`** (VARCHAR, Nullable) – Required follow-up task.
* **`Next_Action_Date`** (DATE, Nullable) – Scheduled follow-up date.
* **`Customer_Escalation`** (DECIMAL) – Flag indicating active escalation status (0 = False, 1 = True).
* **`Escalation_Type`** (VARCHAR, Nullable) – Category of issue (`Performance`, `Customer`, `Technical`).
* **`Notes`** (TEXT, Nullable) – Qualitative agent notes.
* **`Logged_By_Agent_ID`** (VARCHAR) – Staff member logging the entry.

---

## 3. Global Settings & Enumerations (`LISTS_SETTINGS`)
* **`EASYPAY_VALIDITY_DAYS`:** 14 days (or 2 months for recurring account expiration tracking).
* **`TIMEZONE`:** `Africa/Johannesburg`.
* **`DATE_FORMAT`:** `dd mmm yyyy` (e.g., 15 Sep 2026).
* **`CUSTOMER_STATUS` Options:** `New Lead`, `Contact Attempted`, `Interested`, `Order Placed`, `Contacted`, `Activated`, `Payment Pending`.
* **`PAYMENT_STATUS` Options:** `Pending`, `Paid`, `Failed`, `Expired`.
* **`ACTIVATION_STATUS` Options:** `Not Ready`, `Pending`, `Activated`, `Cancelled`.-NoNewline


---

## 4. Support Tickets System

### Overview
The Support portal is a read-only reporting layer over the live AUGSEP sheet (sourced from the Support Tickets AugSep workbook). Support staff log new tickets via logSupportTicket and updates via updateSupportTicket, which write to the SUPPORT_TICKETS sheet inside the CRM spreadsheet.

---

### A. AUGSEP Sheet (Source-of-Truth Import - Aug 2026 to Date)
Sheet Name: AUGSEP | Dimensions: ~21,569 rows x 20 columns

| Col | Header | Description |
|---|---|---|
| 0 | created_da | Date ticket/order was created |
| 1 | completed_ | Completion date (nullable) |
| 2 | channel_partner_user_name | Agent/channel partner who handled it |
| 3 | status | Current status (e.g., Expired, Activated, Pending) |
| 4 | paymentrec | Payment receipt status or reference |
| 5 | contractproductname | Fibre package (e.g., Vuma reach FTTR-20-10-once-off) |
| 6 | description | Description/ref code - may contain OVR-.../OVK-... order refs |
| 7 | customer | Customer full name |
| 8-14 | Update 1 - Update 7 | Sequential tracking notes |
| 15 | Ticket number | Primary ticket identifier |
| 16 | Ticket 2 | Secondary ticket reference (nullable) |
| 17 | Order Number | Explicit order number (OVR-/OVK- prefix) - PREFERRED over description |
| 18 | Update 8 | Additional update note |
| 19 | Update 9 | Additional update note |
| 20 | Sync_Status | Auto-appended by runAgilitySync. Value: Synced once processed. |

Date Filter: Only rows with created_da >= 2026-08-01 are processed by runAgilitySync.

Order Number Resolution Logic (runAgilitySync):
1. Check Order Number (col 17) for OVR-/OVK- prefix - use if found.
2. Fallback: regex scan description (col 6) for (OVR|OVK)-[A-Z0-9-]+ pattern.
3. No result found -> row is skipped (no order ref = no CRM lead).

---

### B. SUPPORT_TICKETS Sheet (CRM-Internal - Written by Support Portal)
Sheet Name: SUPPORT_TICKETS

| Column | Field | Description |
|---|---|---|
| 1 | Ticket_ID | Unique ticket ID (e.g., TKT-A1B2C3D4) |
| 2 | Customer_ID | FK -> CUSTOMERS |
| 3 | Customer_Name | Client name |
| 4 | Provider | Network provider (Vuma, Infinifi, SADV) |
| 5 | Phone | Customer contact number |
| 6 | Product | Package / product name |
| 7 | Order_Number | Associated OVR-/OVK- reference |
| 8 | Description | Issue description / ticket body |
| 9 | Status | Ticket status (Open, In Progress, Resolved, Escalated) |
| 10 | Payment_Rec | Payment receipt reference (if applicable) |
| 11 | Created_Date | Date ticket was logged |
| 12 | Completed_Date | Date ticket was resolved (nullable) |
| 13 | Agent_Name | Support staff who logged the ticket |
| 14 | Ticket_Number | External ISP ticket number (e.g., SA711782, IF031957) |
| 15 | Ticket_2 | Secondary external ticket reference (nullable) |
| 16-24 | Update_1 - Update_9 | Sequential update notes |
| 25 | Last_Updated | Timestamp of last modification |

---

### C. Support Portal Backend Functions (Code.gs)

| Function | Auth | Description |
|---|---|---|
| getSupportTickets(token, payload) | Support/Admin | Paginated fetch from SUPPORT_TICKETS. Filters: search, status, provider, dateFrom, dateTo, offset, limit. |
| getSupportCustomers(token, payload) | Support/Admin | Paginated fetch from CUSTOMERS. Same filter params. |
| logSupportTicket(token, payload) | Support/Admin | Creates new row in SUPPORT_TICKETS. Auto-generates TKT- prefixed ID. |
| updateSupportTicket(token, payload) | Support/Admin | Updates existing ticket row (status, update notes, completion date). |
| runAgilitySync(token) | Admin only | Reads AUGSEP, deduplicates vs ORDERS, writes new leads to CUSTOMERS/ORDERS/PAYMENTS/ACTIVATIONS. Marks rows Synced. |

---

### D. Other Support Workbook Sheets (Reference Only - Not Synced to CRM)

| Sheet | Rows | Purpose |
|---|---|---|
| Pierre leads | 11 | Lead capture form responses (Timestamp, Name, Surname, Email, Phone, Alt Phone, Address, Internal Status) |
| Support tickets logged infinifi | 12 | Manual Infinifi ticket log (Ticket number, Date logged, Requested by, Query) |
| Support tickets logged SADV | 6 | Manual SADV ticket log (Ticket number, Date logged, Requested by, Query) |
| Infinifi customers | 67 | Infinifi customer records (Created Date, Customer, Lead Number, Region, Contract Term, MRC, Vuma Reach Premise ID, Action Type) |
| Business leads - SADV | 2 | SADV business lead template (Customer Name, Surname, Contact 1, Contact 2, Address, Lead source) |
| SS meaning | 21 | SOP: Self-Scheduling explanation and regional booking ETAs (24 hr standard) |
| Refund of incorrect payments | 4 | SOP: EasyPay refund handling - 14-21 working day turnaround |
| Infinifi link | 3 | SOP: Customer order verification links via SMS/email |
| Refund process | 6 | SOP: Escalation process for uninstalled client refunds (ID + Proof of Account + PoP required) |
| SS SOP | 4 | SOP: Self-Scheduling standard operating procedure |
| Ticketing SOP | 11 | SOP: Call center procedures for payments, referrals, morning support tasks |
| Premis creation | 2 | SOP: Vumatel premise creation tickets - 24-48 hr ETA |
| Moving funds | 3 | SOP: Fund transfer between duplicate order numbers for same customer only |

---

### E. Support Data Flow

AUGSEP sheet (~21,569 rows, Aug 2026 onwards)
       |
       v  runAgilitySync()  [Admin-only trigger]
       |  - Filters: created_da >= 2026-08-01
       |  - Extracts: customer, order number, product, agent, status, payment
       |  - Deduplicates against ORDERS sheet (OVR/OVK maps)
       |  - Appends new leads to CUSTOMERS, ORDERS, PAYMENTS, ACTIVATIONS
       |  - Marks processed rows: Sync_Status = Synced
       |
       v
CRM Core Sheets: CUSTOMERS . ORDERS . PAYMENTS . ACTIVATIONS
       |
       v  getSupportCustomers() / getSupportTickets()
       |
Support Portal UI (support/index.html + support/support.js)
       |
       +-- logSupportTicket()    -> appends to SUPPORT_TICKETS
       +-- updateSupportTicket() -> updates SUPPORT_TICKETS row

---

### F. Key Business Rules (Support Context)

- Refunds take 14-21 working days - agents must send the correct EasyPay number immediately to avoid activation delays.
- EasyPay numbers are NEVER auto-generated - agents enter them manually after customer contact.
- OVR prefix = SADV OVR order (Vumatel Reach). OVK prefix = SADV OVK tracking reference.
- Self-Scheduling (SS): If the ISP cannot self-schedule, the order goes to the regional team with a 24-hour installation ETA.
- Premise creation takes 24-48 hours via a Vumatel SADV ticket.
- Fund transfers between order numbers are only permitted for the same customer with different duplicate order references.
- POPIA compliance: No customer PII is logged to external systems - all data stays within the Google Workspace/Apps Script environment.
