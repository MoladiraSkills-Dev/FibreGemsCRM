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
* **`ACTIVATION_STATUS` Options:** `Not Ready`, `Pending`, `Activated`, `Cancelled`.