const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const ss = SpreadsheetApp.openById(SHEET_ID);

// ============================================================
// 1. API ROUTER
// ============================================================

function doPost(e) {
  try {
    // Note: To bypass CORS preflight issues in browsers, the frontend must send
    // Content-Type: text/plain, but the payload will be a JSON string.
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};
    const token = body.token;
    let result;

    switch (action) {
      case 'handleLogin':
        result = handleLogin(payload.email, payload.password);
        break;
      case 'handleAgentLeadUpdate':
        result = handleAgentLeadUpdate(payload.existingIdOverride, payload.formData, token);
        break;
      case 'getAgentWorklist':
        result = getAgentWorklist(token, payload.offset, payload.limit);
        break;
      case 'getAgentDailyQueue':
        result = getAgentDailyQueue(token);
        break;
      case 'logCallOutcome':
        result = logCallOutcome(token, payload);
        break;
      case 'getAgentActivityLog':
        result = getAgentActivityLog(token, payload.offset, payload.limit);
        break;
      case 'quickUpdateSalesData':
        result = quickUpdateSalesData(payload.customerId, payload.data, token);
        break;
      case 'getAdminDashboard':
        result = getAdminDashboard(token);
        break;
      case 'getAdminMasterGrid':
        result = getAdminMasterGrid(token, payload.offset, payload.limit);
        break;
      case 'getAdminCallbackReport':
        result = getAdminCallbackReport(token, payload.targetDate);
        break;
      case 'enforceLeadLifecycleRules':
        result = enforceLeadLifecycleRules(token);
        break;
      case 'runAgilitySync':
        result = runAgilitySync(token);
        break;
      case 'getAgentList':
        result = getAgentList(token);
        break;
      case 'createAgent':
        result = createAgent(token, payload);
        break;
      case 'updateAgent':
        result = updateAgent(token, payload);
        break;
      case 'setAgentTempPassword':
        result = setAgentTempPassword(token, payload);
        break;
      case 'deleteAgent':
        result = deleteAgent(token, payload.agentId);
        break;
      case 'adminUpdateFollowUp':
        result = adminUpdateFollowUp(token, payload);
        break;
      case 'getAdminPromisedPayments':
        result = getAdminPromisedPayments(token);
        break;
      default:
        throw new Error("Invalid API action requested: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Optional: Keep doGet for basic ping/status check
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'active', system: 'FibreGems API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 2. HELPER FUNCTIONS & BUSINESS RULES VALIDATION
// ============================================================

function hashPassword(password, salt) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt, Utilities.Charset.UTF_8);
  return rawHash.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

function handleLogin(email, password) {
  const data = ss.getSheetByName('Users').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2].toString().toLowerCase() === email.toLowerCase()) {
      if (data[i][6] !== 'Verified') throw new Error('Account inactive.');
      if (hashPassword(password, data[i][4]) === data[i][3]) {
        const token = Utilities.getUuid();
        const agentId = data[i][0];
        const name = data[i][1];
        const now = new Date();
        ss.getSheetByName('Daily_Logs').appendRow([Utilities.getUuid().slice(0,8), agentId, name, Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd"), now, now, token]);
        return { token, role: data[i][5], name: name, agentId: agentId };
      }
      throw new Error('Invalid credentials.');
    }
  }
  throw new Error('User not found.');
}

function getSessionUser(token) {
  if (!token) throw new Error('Unauthenticated');
  const logs = ss.getSheetByName('Daily_Logs').getDataRange().getValues();
  for (let i = logs.length - 1; i > 0; i--) {
    if (logs[i][6] === token) {
      const users = ss.getSheetByName('Users').getDataRange().getValues();
      const user = users.find(u => u[0] === logs[i][1]);
      if(!user) throw new Error('User not found');
      return { agentId: user[0], role: user[5], name: user[1] };
    }
  }
  throw new Error('Session expired. Please log in again.');
}

function requireAdmin_(token) {
  const s = getSessionUser(token);
  if (s.role !== 'Admin') throw new Error('Admin privileges required.');
  return s;
}

/**
 * Validates follow-up / next action date.
 * Rule: Next action date cannot exceed Today + 8 days (8-day follow-up limit).
 */
function validateFollowUpDate_(dateStr) {
  if (!dateStr) return '';
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const targetDate = new Date(dateStr + 'T00:00:00');
  const today = new Date(todayStr + 'T00:00:00');
  const diffDays = Math.round((targetDate - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays > 8) {
    throw new Error("Follow-up / Call Back date cannot exceed 8 days from today (8-day rule limit).");
  }
  if (diffDays < 0) {
    throw new Error("Follow-up / Call Back date cannot be set in the past.");
  }
  return dateStr;
}

/**
 * Returns formatted date string (yyyy-MM-dd) safely from Date or string
 */
function formatDateSafe_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val).slice(0, 10);
}

// ============================================================
// 3. AGENT LEAD CAPTURE & UPDATE
// ============================================================

function handleAgentLeadUpdate(existingIdOverride, formData, token) {
  const session = getSessionUser(token);
  const timestamp = new Date().toISOString();
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  
  // Validate 8-day follow up limit
  if (formData.nextActionDate) {
    validateFollowUpDate_(formData.nextActionDate);
  }
  
  // Duplicate protection
  if (!existingIdOverride && formData.cellNumber) {
    const inputCell = String(formData.cellNumber).trim();
    for (let i = 1; i < custData.length; i++) {
      if (String(custData[i][8]).trim() === inputCell) {
        if (custData[i][30] === session.agentId) return { duplicateAlert: true, existingId: custData[i][0], existingName: custData[i][7] };
        else throw new Error("Block: This customer already exists in the company pipeline.");
      }
    }
  }
  
  const isSaleWon = (formData.customerStatus === 'Won' || formData.customerStatus === 'Sale Completed');
  // Order date is automatically the exact current day (Order Date >= Created Date)
  const orderDate = (isSaleWon || formData.orderDate) ? todayStr : "";
  
  let customerId = existingIdOverride;
  if(!customerId) {
    // New lead — insert across all tables
    customerId = 'CUS-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    custSheet.appendRow([
      customerId, 'Active', timestamp, session.agentId, timestamp, formData.firstName, formData.surname, `${formData.firstName} ${formData.surname}`,
      formData.cellNumber, formData.alternateCell, formData.email, formData.address, formData.suburb, formData.package || "", formData.paymentType || "",
      orderDate, "", "", "", "", "", "", "", formData.promisedPaymentDate || "", "", "", "", "", "", session.agentId, session.agentId, "",
      formData.customerStatus || "New Lead", formData.nextAction || "", formData.nextActionDate || "", "", todayStr, formData.lastContactOutcome || ""
    ]);
    
    if (orderDate || isSaleWon) {
      ss.getSheetByName('ORDERS').appendRow(['ORD-' + Utilities.getUuid().slice(0,8), customerId, `${formData.firstName} ${formData.surname}`, orderDate, '', '', session.name, isSaleWon ? 'Sale Completed' : 'Pending', formData.nextAction||'', formData.nextActionDate||'', todayStr, 'Direct Capture']);
      ss.getSheetByName('PAYMENTS').appendRow(['PAY-' + Utilities.getUuid().slice(0,8), customerId, 'Pending', formData.promisedPaymentDate||"", '', '']);
      ss.getSheetByName('ACTIVATIONS').appendRow(['ACT-' + Utilities.getUuid().slice(0,8), customerId, 'Pending', '', '']);
    }
  } else {
    // Update existing lead
    let rowIndex = custData.findIndex(r => r[0] === customerId) + 1;
    if(rowIndex > 0) {
      custSheet.getRange(rowIndex, 5, 1, 9).setValues([[timestamp, formData.firstName, formData.surname, `${formData.firstName} ${formData.surname}`, formData.cellNumber, formData.alternateCell, formData.email, formData.address, formData.suburb]]);
      custSheet.getRange(rowIndex, 14, 1, 3).setValues([[formData.package || "", formData.paymentType || "", orderDate]]);
      custSheet.getRange(rowIndex, 33, 1, 3).setValues([[formData.customerStatus, formData.nextAction, formData.nextActionDate]]);
      custSheet.getRange(rowIndex, 37, 1, 2).setValues([[todayStr, formData.lastContactOutcome || ""]]);
    }
  }
  
  // Audit log
  ss.getSheetByName('ACTIVITY_LOG').appendRow([
    'ACT-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
    timestamp,
    customerId,
    `${formData.firstName} ${formData.surname}`,
    session.agentId,
    existingIdOverride ? "Lead Updated" : "Lead Captured",
    "Web Portal",
    formData.lastContactOutcome || (isSaleWon ? "Sale Won" : "Details Captured"),
    formData.customerStatus || "New Lead",
    formData.promisedPaymentDate || "",
    formData.nextAction || "",
    formData.nextActionDate || "",
    "False",
    "None",
    "",
    formData.notes || "",
    session.agentId,
    timestamp
  ]);
  
  return { success: true, customerId: customerId };
}

// ============================================================
// 4. AGENT DAILY QUEUE & DEDICATED CALL BACK WORKFLOW
// ============================================================

/**
 * Returns today's active leads and callbacks for the logged-in agent.
 * STRICT RULE: Only shows leads relevant for TODAY (scheduled for today or overdue).
 * Leads scheduled for a future day are excluded and will only show on their scheduled date.
 */
function getAgentDailyQueue(token) {
  const session = getSessionUser(token);
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const todayDate = new Date(todayStr + 'T00:00:00');
  
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const actData  = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues();

  // Map latest activity for each customer by this agent
  const agentActivityMap = {};
  // Count touches logged today by this agent
  let todayTouchCount = 0;
  for (let i = 1; i < actData.length; i++) {
    const row = actData[i];
    const rowAgentId = String(row[4] || '').trim();
    const customerId = String(row[2] || '').trim();
    const actDateStr = formatDateSafe_(row[1]);
    
    if (rowAgentId === session.agentId) {
      if (actDateStr === todayStr) todayTouchCount++;
      if (customerId) agentActivityMap[customerId] = row;
    }
  }

  const todayCallbacks = [];
  const todayNewLeads = [];
  let totalScheduledToday = 0;
  let callbacksCompletedToday = 0;

  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const custId = String(row[0] || '').trim();
    const recordStatus = String(row[1] || 'Active').trim();
    const createdStr = formatDateSafe_(row[2]);
    const assignedAgent = String(row[30] || '').trim();
    const status = String(row[32] || '').trim();
    const nextAction = String(row[33] || '').trim();
    const nextActionDate = formatDateSafe_(row[34]);
    const lastContactDate = formatDateSafe_(row[36]);

    if (!custId || recordStatus === 'Archived' || recordStatus === 'Expired') continue;
    if (status === 'Won' || status === 'Lost' || status.includes('Lost')) continue;

    const ownsCustomer = (assignedAgent === session.agentId);
    if (!ownsCustomer) continue;

    // Check if customer is scheduled for callback
    const promisedPaymentDate = formatDateSafe_(row[23]);

    if (nextActionDate) {
      const scheduledDate = new Date(nextActionDate + 'T00:00:00');
      const diffDays = Math.round((todayDate - scheduledDate) / (1000 * 60 * 60 * 24));
      
      // Future callbacks (diffDays < 0): HIDE! They should ONLY show on the scheduled day
      if (diffDays < 0) {
        continue;
      }

      totalScheduledToday++;
      const isCompleted = (lastContactDate === todayStr);
      if (isCompleted) callbacksCompletedToday++;

      todayCallbacks.push({
        customerId: custId,
        name: String(row[7] || `${row[5]} ${row[6]}`),
        cellNumber: String(row[8] || ''),
        alternateCell: String(row[9] || ''),
        package: String(row[13] || ''),
        status: status,
        nextAction: nextAction,
        nextActionDate: nextActionDate,
        promisedPaymentDate: promisedPaymentDate,
        isOverdue: diffDays > 0,
        daysOverdue: Math.max(0, diffDays),
        isCompletedToday: isCompleted,
        isPromisedPayment: false,
        lastOutcome: String(row[37] || (agentActivityMap[custId] ? agentActivityMap[custId][7] : ''))
      });
    } else if (promisedPaymentDate) {
      // Promised Payment Date follow-up: appears when the payment date has arrived (today or overdue)
      const payDate = new Date(promisedPaymentDate + 'T00:00:00');
      const payDiffDays = Math.round((todayDate - payDate) / (1000 * 60 * 60 * 24));
      // Only surface on or after the promised date
      if (payDiffDays >= 0) {
        totalScheduledToday++;
        const isCompleted = (lastContactDate === todayStr);
        if (isCompleted) callbacksCompletedToday++;
        todayCallbacks.push({
          customerId: custId,
          name: String(row[7] || `${row[5]} ${row[6]}`),
          cellNumber: String(row[8] || ''),
          alternateCell: String(row[9] || ''),
          package: String(row[13] || ''),
          status: status,
          nextAction: 'Payment Follow-Up',
          nextActionDate: promisedPaymentDate,
          promisedPaymentDate: promisedPaymentDate,
          isOverdue: payDiffDays > 0,
          daysOverdue: Math.max(0, payDiffDays),
          isCompletedToday: isCompleted,
          isPromisedPayment: true,
          lastOutcome: String(row[37] || (agentActivityMap[custId] ? agentActivityMap[custId][7] : ''))
        });
      }
    } else if (createdStr === todayStr) {
      // New lead assigned or captured today without scheduled action yet
      todayNewLeads.push({
        customerId: custId,
        name: String(row[7] || `${row[5]} ${row[6]}`),
        cellNumber: String(row[8] || ''),
        package: String(row[13] || ''),
        status: status,
        createdDate: createdStr,
        isCompletedToday: (lastContactDate === todayStr)
      });
    }
  }

  // Sort callbacks: overdue first, then scheduled today, completed at the end
  todayCallbacks.sort((a, b) => {
    if (a.isCompletedToday !== b.isCompletedToday) return a.isCompletedToday ? 1 : -1;
    return b.daysOverdue - a.daysOverdue;
  });

  return {
    todayStr: todayStr,
    callbacks: todayCallbacks,
    newLeads: todayNewLeads,
    stats: {
      totalScheduled: totalScheduledToday,
      completedToday: callbacksCompletedToday,
      remainingToday: Math.max(0, totalScheduledToday - callbacksCompletedToday),
      todayTouches: todayTouchCount
    }
  };
}

/**
 * 1-Click Call Outcome Logger for Agents.
 * Replaces spreadsheets: instantly records touchpoint, updates customer record,
 * auto-sets order date if won, and enforces the strict 8-day follow-up limit.
 */
function logCallOutcome(token, payload) {
  const session = getSessionUser(token);
  const { customerId, outcome, notes, nextAction, nextActionDate, packageChoice, paymentType, newPromisedPaymentDate } = payload;
  
  if (!customerId) throw new Error("Customer ID is required.");
  if (!outcome) throw new Error("Call outcome is required.");

  // Validate 8-day rule limit
  if (nextActionDate) {
    validateFollowUpDate_(nextActionDate);
  }

  const timestamp = new Date().toISOString();
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  
  const rowIndex = custData.findIndex(r => String(r[0]) === String(customerId)) + 1;
  if (rowIndex === 0) throw new Error("Customer not found.");

  const isSaleWon = (outcome === 'Sale Won' || outcome === 'Sale Completed');
  const isLost = (outcome === 'Not Interested' || outcome === 'Lost' || outcome === 'Invalid Lead');
  
  let newStatus = 'In Progress';
  if (isSaleWon) newStatus = 'Won';
  else if (isLost) newStatus = 'Lost';
  else if (outcome === 'Callback Rescheduled') newStatus = 'Callback Scheduled';
  else if (outcome === 'No Answer / Voicemail') newStatus = 'Follow-Up Needed';
  else if (outcome === 'Payment Received') newStatus = 'Payment Received';
  else if (outcome === 'No Payment - Reschedule') newStatus = 'Payment Pending';
  else if (outcome === 'New Payment Date') newStatus = 'Payment Pending';

  const custRow = custData[rowIndex - 1];
  const customerName = custRow[7] || `${custRow[5]} ${custRow[6]}`;

  // Update CUSTOMERS record
  custSheet.getRange(rowIndex, 5).setValue(timestamp); // Last_Updated_DateTime
  if (packageChoice) custSheet.getRange(rowIndex, 14).setValue(packageChoice);
  if (paymentType) custSheet.getRange(rowIndex, 15).setValue(paymentType);
  
  // If sale won: Automatic Order Date = exact day (Order Date >= Created Date)
  if (isSaleWon) {
    custSheet.getRange(rowIndex, 16).setValue(todayStr); // Order_Date
    ss.getSheetByName('ORDERS').appendRow([
      'ORD-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
      customerId,
      customerName,
      todayStr,
      '',
      '',
      session.name,
      'Sale Completed',
      nextAction || '',
      nextActionDate || '',
      todayStr,
      'Agent Portal Call'
    ]);
    ss.getSheetByName('PAYMENTS').appendRow(['PAY-' + Utilities.getUuid().slice(0,8), customerId, 'Pending', '', '', '']);
    ss.getSheetByName('ACTIVATIONS').appendRow(['ACT-' + Utilities.getUuid().slice(0,8), customerId, 'Pending', '', '']);
  }

  // Update promised payment date if a new one was set by the agent
  if (newPromisedPaymentDate) {
    custSheet.getRange(rowIndex, 24).setValue(newPromisedPaymentDate); // Promised_Payment_Date col
  } else if (outcome === 'Payment Received') {
    // Clear the promised payment date once payment is confirmed received
    custSheet.getRange(rowIndex, 24).setValue('');
  }

  custSheet.getRange(rowIndex, 33, 1, 3).setValues([[newStatus, nextAction || (outcome === 'Callback Rescheduled' ? 'Call Back' : ''), nextActionDate || '']]);
  custSheet.getRange(rowIndex, 37, 1, 2).setValues([[todayStr, outcome]]);
  // Reset escalation flag since contact occurred
  custSheet.getRange(rowIndex, 28, 1, 3).setValues([["False", "None", ""]]);

  // Log in ACTIVITY_LOG
  ss.getSheetByName('ACTIVITY_LOG').appendRow([
    'ACT-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
    timestamp,
    customerId,
    customerName,
    session.agentId,
    "Call Logged",
    "Phone Call",
    outcome,
    newStatus,
    "",
    nextAction || "",
    nextActionDate || "",
    "False",
    "None",
    "",
    notes || "",
    session.agentId,
    timestamp
  ]);

  return { success: true, customerId, newStatus };
}

// ============================================================
// 5. STANDARD AGENT WORKLIST & ACTIVITY LOG
// ============================================================

function getAgentWorklist(token, offset, limit) {
  const session = getSessionUser(token);
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const actData  = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues();

  const agentActivityMap = {};
  for (let i = 1; i < actData.length; i++) {
    const row = actData[i];
    const rowAgentId      = String(row[4]  || '').trim();
    const rowLoggedById   = String(row[16] || '').trim();
    const customerId      = String(row[2]  || '').trim();
    if (!customerId) continue;
    if (rowAgentId !== session.agentId && rowLoggedById !== session.agentId) continue;
    agentActivityMap[customerId] = row;
  }

  let worklist = [];
  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const custId = String(row[0] || '').trim();
    const assignedAgent = String(row[30] || '').trim();
    if (row[1] === 'Archived' || row[1] === 'Expired') continue;

    const ownsCustomer = (assignedAgent === session.agentId);
    const hasActivity = !!agentActivityMap[custId];
    if (!ownsCustomer && !hasActivity) continue;

    const naDate = formatDateSafe_(row[34]);
    const lastAct = agentActivityMap[custId];
    let lastContactDate = formatDateSafe_(row[36]);
    let lastActionType = '';
    let lastOutcome = String(row[37] || '');
    
    if (lastAct) {
      if (!lastContactDate) lastContactDate = formatDateSafe_(lastAct[1]);
      lastActionType = String(lastAct[5] || '').trim();
      if (!lastOutcome) lastOutcome = String(lastAct[7] || '').trim();
    }

    worklist.push({
      customerId:      custId,
      name:            row[7] || `${row[5]} ${row[6]}`,
      cellNumber:      String(row[8] || ''),
      package:         row[13],
      status:          row[32],
      nextAction:      row[33] || '',
      nextActionDate:  naDate  || '',
      lastContactDate: lastContactDate,
      lastActionType:  lastActionType,
      lastOutcome:     lastOutcome
    });
  }
  worklist.reverse();
  return { data: worklist.slice(offset, offset + limit), total: worklist.length };
}

function getAgentActivityLog(token, offset, limit) {
  const session  = getSessionUser(token);
  const actData  = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues();
  let rows = [];
  for (let i = 1; i < actData.length; i++) {
    const row = actData[i];
    const rowAgentId    = String(row[4]  || '').trim();
    const rowLoggedById = String(row[16] || '').trim();
    if (rowAgentId !== session.agentId && rowLoggedById !== session.agentId) continue;
    
    let actDate = row[1];
    if (actDate && actDate instanceof Date) {
      actDate = Utilities.formatDate(actDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    }
    rows.push({
      activityId:    String(row[0]  || ''),
      dateTime:      actDate         || '',
      customerId:    String(row[2]  || ''),
      customerName:  String(row[3]  || ''),
      actionType:    String(row[5]  || ''),
      contactMethod: String(row[6]  || ''),
      outcome:       String(row[7]  || ''),
      statusAfter:   String(row[8]  || ''),
      nextAction:    String(row[10] || ''),
      nextActionDate:formatDateSafe_(row[11]),
      notes:         String(row[15] || '')
    });
  }
  rows.reverse();
  return { data: rows.slice(offset, offset + limit), total: rows.length };
}

function quickUpdateSalesData(customerId, payload, token) {
  const session = getSessionUser(token);
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  let rowIndex = custData.findIndex(r => r[0] === customerId && r[30] === session.agentId) + 1;
  if (rowIndex === 0) throw new Error("Unauthorized or Customer not found.");
  
  if (payload.nextActionDate) {
    validateFollowUpDate_(payload.nextActionDate);
  }

  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  custSheet.getRange(rowIndex, 14).setValue(payload.package);
  custSheet.getRange(rowIndex, 33, 1, 3).setValues([[payload.status, payload.nextAction, payload.nextActionDate]]);  
  custSheet.getRange(rowIndex, 37).setValue(todayStr);

  ss.getSheetByName('ACTIVITY_LOG').appendRow([
    'ACT-' + Utilities.getUuid().substring(0,8).toUpperCase(),
    new Date(),
    customerId,
    custData[rowIndex-1][7],
    session.agentId,
    "Quick Edit",
    "",
    "Quick Update",
    payload.status,
    "",
    payload.nextAction,
    payload.nextActionDate,
    "False",
    "None",
    "",
    "",
    session.agentId,
    new Date()
  ]);
  return { success: true };
}

// ============================================================
// 6. ADMIN DASHBOARD & CALL BACK ACCOUNTABILITY REPORTING
// ============================================================

function getAdminDashboard(token) {
  requireAdmin_(token);
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const activityData = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues().slice(1);
  const userMap = new Map(ss.getSheetByName('Users').getDataRange().getValues().slice(1).map(u => [u[0], {name: u[1], role: u[5]}]));
  
  const agentStats = {};
  activityData.forEach(row => {
    let logDate = new Date(row[1]);
    if (formatDateSafe_(logDate) === todayStr) {
      const aid = row[4];
      if (!agentStats[aid]) agentStats[aid] = { count: 0, lastActivity: logDate };
      agentStats[aid].count++;
      if (logDate > agentStats[aid].lastActivity) agentStats[aid].lastActivity = logDate;
    }
  });
  
  const agents = Object.keys(agentStats).map(aid => ({
    agentId: aid,
    name: userMap.get(aid)?.name || 'Unknown',
    role: userMap.get(aid)?.role || 'Agent',
    touches: agentStats[aid].count,
    lastActive: agentStats[aid].lastActivity
  })).sort((a,b) => b.lastActive - a.lastActive);
  
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues().slice(1);
  const statuses = custData.reduce((acc, row) => { 
    if (row[1] !== 'Archived' && row[1] !== 'Expired') {
      const stat = row[32] || 'New Lead'; 
      acc[stat] = (acc[stat] || 0) + 1; 
    }
    return acc; 
  }, {});
  
  return { activeCount: agents.length, agents, statuses };
}

/**
 * Admin Comprehensive Call Back Report & Escalation Monitor.
 * Reports on agent callback completion, missed callbacks, and 7-day escalations.
 */
function getAdminCallbackReport(token, targetDate) {
  requireAdmin_(token);
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const reportDateStr = targetDate || todayStr;
  const reportDate = new Date(reportDateStr + 'T00:00:00');
  
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const actData  = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues();
  const usersData = ss.getSheetByName('Users').getDataRange().getValues();
  const userMap = new Map(usersData.slice(1).map(u => [String(u[0]), { name: u[1], role: u[5] }]));

  // Build agent map
  const agentReport = {};
  userMap.forEach((user, id) => {
    agentReport[id] = {
      agentId: id,
      name: user.name,
      role: user.role,
      scheduled: 0,
      completed: 0,
      missed: 0,
      completionRate: 0
    };
  });

  const missedCallbacks = [];
  const escalatedLeads = [];

  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const custId = String(row[0] || '').trim();
    if (!custId || row[1] === 'Archived' || row[1] === 'Expired') continue;

    const assignedAgentId = String(row[30] || '').trim();
    const customerName = String(row[7] || `${row[5]} ${row[6]}`);
    const phone = String(row[8] || '');
    const status = String(row[32] || '');
    const nextActionDate = formatDateSafe_(row[34]);
    const lastContactDate = formatDateSafe_(row[36]);
    const isEscalated = (String(row[27] || '').toUpperCase() === 'TRUE');
    const escalationType = String(row[28] || 'Level 1');
    const escalationReason = String(row[29] || '');

    // Check scheduled callbacks on or before reportDate
    if (nextActionDate && status !== 'Won' && status !== 'Lost' && !status.includes('Lost')) {
      const scheduledDate = new Date(nextActionDate + 'T00:00:00');
      const isDueOnReportDate = (nextActionDate === reportDateStr);
      const isOverdue = (scheduledDate < reportDate);

      if (agentReport[assignedAgentId] && (isDueOnReportDate || isOverdue)) {
        agentReport[assignedAgentId].scheduled++;
        const touchedOnOrAfter = (lastContactDate >= nextActionDate);
        
        if (touchedOnOrAfter) {
          agentReport[assignedAgentId].completed++;
        } else {
          agentReport[assignedAgentId].missed++;
          missedCallbacks.push({
            customerId: custId,
            name: customerName,
            phone: phone,
            agentId: assignedAgentId,
            agentName: userMap.get(assignedAgentId)?.name || 'Unassigned',
            scheduledDate: nextActionDate,
            daysOverdue: Math.max(1, Math.round((reportDate - scheduledDate) / (1000 * 60 * 60 * 24))),
            lastOutcome: String(row[37] || 'None')
          });
        }
      }
    }

    // 7-day stale check / Escalations
    const createdDate = new Date(formatDateSafe_(row[2]) + 'T00:00:00');
    const daysSinceCreation = Math.round((reportDate - createdDate) / (1000 * 60 * 60 * 24));
    let daysSinceContact = 999;
    if (lastContactDate) {
      daysSinceContact = Math.round((reportDate - new Date(lastContactDate + 'T00:00:00')) / (1000 * 60 * 60 * 24));
    }

    if (isEscalated || (daysSinceContact >= 7 && status !== 'Won' && status !== 'Lost' && !status.includes('Lost'))) {
      escalatedLeads.push({
        customerId: custId,
        name: customerName,
        phone: phone,
        agentId: assignedAgentId,
        agentName: userMap.get(assignedAgentId)?.name || 'Unassigned',
        daysSinceContact: daysSinceContact === 999 ? daysSinceCreation : daysSinceContact,
        escalationLevel: daysSinceContact >= 14 ? 'Level 3 - Operations Escalation' : 'Level 2 - Supervisor Alert',
        reason: escalationReason || `No feedback/touch for ${daysSinceContact === 999 ? daysSinceCreation : daysSinceContact} days`
      });
    }
  }

  // Calculate completion rates
  const agentList = Object.values(agentReport).map(ag => {
    ag.completionRate = ag.scheduled > 0 ? Math.round((ag.completed / ag.scheduled) * 100) : 100;
    return ag;
  }).sort((a, b) => b.missed - a.missed);

  return {
    reportDate: reportDateStr,
    agents: agentList,
    missedCallbacks: missedCallbacks,
    escalatedLeads: escalatedLeads,
    totalScheduled: agentList.reduce((acc, a) => acc + a.scheduled, 0),
    totalCompleted: agentList.reduce((acc, a) => acc + a.completed, 0),
    totalMissed: missedCallbacks.length,
    totalEscalated: escalatedLeads.length
  };
}

// ============================================================
// 7. AUTOMATED LEAD LIFECYCLE ENGINE (42-Day Lost & 7-Day Escalation)
// ============================================================

/**
 * Enforces automated lead lifecycle rules:
 * 1. 42-Day Auto-Lost: Any lead open > 42 days without win is flagged Lost (42-Day Expiry).
 * 2. 7-Day Escalation: Any lead with no contact for >= 7 days is escalated to supervisor.
 */
function enforceLeadLifecycleRules(token) {
  requireAdmin_(token);
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const today = new Date(todayStr + 'T00:00:00');
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  const timestamp = new Date().toISOString();

  let expiredCount = 0;
  let escalatedCount = 0;

  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const custId = String(row[0] || '').trim();
    if (!custId || row[1] === 'Archived' || row[1] === 'Expired') continue;

    const status = String(row[32] || '');
    if (status === 'Won' || status === 'Lost' || status.includes('Lost')) continue;

    const createdDateStr = formatDateSafe_(row[2]);
    const lastContactDateStr = formatDateSafe_(row[36]);
    const nextActionDateStr = formatDateSafe_(row[34]);

    const createdDate = new Date(createdDateStr + 'T00:00:00');
    const ageDays = Math.round((today - createdDate) / (1000 * 60 * 60 * 24));

    // Rule 1: 42-Day Auto-Lost Expiry
    if (ageDays > 42) {
      const rowIndex = i + 1;
      custSheet.getRange(rowIndex, 2).setValue('Expired'); // Record_Status
      custSheet.getRange(rowIndex, 33).setValue('Lost (42-Day Expiry)'); // Customer_Status
      custSheet.getRange(rowIndex, 5).setValue(timestamp);
      
      ss.getSheetByName('ACTIVITY_LOG').appendRow([
        'ACT-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
        timestamp,
        custId,
        row[7] || `${row[5]} ${row[6]}`,
        'SYSTEM',
        'Auto-Expiry',
        'System Cron',
        'Lost (42-Day Expiry)',
        'Lost (42-Day Expiry)',
        '',
        'None',
        '',
        'False',
        'None',
        '',
        `Lead exceeded 42-day lifespan (${ageDays} days since creation). Automatically flagged as Lost.`,
        'SYSTEM',
        timestamp
      ]);
      expiredCount++;
      continue;
    }

    // Rule 2: 7-Day Uncontacted Escalation
    let daysWithoutContact = ageDays;
    if (lastContactDateStr) {
      daysWithoutContact = Math.round((today - new Date(lastContactDateStr + 'T00:00:00')) / (1000 * 60 * 60 * 24));
    }

    if (daysWithoutContact >= 7) {
      const rowIndex = i + 1;
      custSheet.getRange(rowIndex, 28, 1, 3).setValues([[
        "TRUE",
        daysWithoutContact >= 14 ? "Level 3 - Operations Escalation" : "Level 2 - Supervisor Alert",
        `No contact/feedback for ${daysWithoutContact} days`
      ]]);
      escalatedCount++;
    }
  }

  return { success: true, expiredCount, escalatedCount };
}

// ============================================================
// 9b. ADMIN FOLLOW-UP OVERRIDE & PROMISED PAYMENT QUERIES
// ============================================================

/**
 * Admin can force-reschedule a missed callback or payment follow-up.
 * Bypasses the 8-day rule. Requires admin token.
 */
function adminUpdateFollowUp(token, payload) {
  requireAdmin_(token);
  const { customerId, newNextActionDate, notes, reassignToAgentId } = payload;
  if (!customerId) throw new Error('customerId is required.');
  if (!newNextActionDate) throw new Error('New next action date is required.');

  const timestamp = new Date().toISOString();
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  const rowIndex = custData.findIndex(r => String(r[0]) === String(customerId)) + 1;
  if (rowIndex === 0) throw new Error('Customer not found.');

  const custRow = custData[rowIndex - 1];
  const customerName = custRow[7] || `${custRow[5]} ${custRow[6]}`;

  // Update next action + date
  custSheet.getRange(rowIndex, 34, 1, 2).setValues([['Call Back', newNextActionDate]]);
  custSheet.getRange(rowIndex, 5).setValue(timestamp);

  // Optionally reassign agent
  if (reassignToAgentId) {
    custSheet.getRange(rowIndex, 31).setValue(reassignToAgentId); // Assigned_Agent col
  }

  // Log to ACTIVITY_LOG
  ss.getSheetByName('ACTIVITY_LOG').appendRow([
    'ACT-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
    timestamp,
    customerId,
    customerName,
    reassignToAgentId || custRow[30],
    'Admin Override',
    'Admin Portal',
    'Follow-Up Rescheduled by Admin',
    custRow[32] || '',
    '',
    'Call Back',
    newNextActionDate,
    'False',
    'None',
    '',
    notes || '',
    'ADMIN',
    timestamp
  ]);

  return { success: true, customerId, newNextActionDate };
}

/**
 * Returns all active leads with an upcoming or overdue Promised Payment Date.
 * Admin only.
 */
function getAdminPromisedPayments(token) {
  requireAdmin_(token);
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const todayDate = new Date(todayStr + 'T00:00:00');
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const usersData = ss.getSheetByName('Users').getDataRange().getValues();
  const userMap = new Map(usersData.slice(1).map(u => [String(u[0]), String(u[1])]));

  const results = [];
  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const custId = String(row[0] || '').trim();
    if (!custId || row[1] === 'Archived' || row[1] === 'Expired') continue;
    const status = String(row[32] || '');
    if (status === 'Won' || status === 'Lost' || status.includes('Lost')) continue;
    const promisedPaymentDate = formatDateSafe_(row[23]);
    if (!promisedPaymentDate) continue;

    const payDate = new Date(promisedPaymentDate + 'T00:00:00');
    const daysUntilDue = Math.round((payDate - todayDate) / (1000 * 60 * 60 * 24));
    const assignedAgentId = String(row[30] || '');

    results.push({
      customerId: custId,
      name: String(row[7] || `${row[5]} ${row[6]}`),
      phone: String(row[8] || ''),
      agentId: assignedAgentId,
      agentName: userMap.get(assignedAgentId) || 'Unassigned',
      promisedPaymentDate: promisedPaymentDate,
      daysUntilDue: daysUntilDue,
      status: status
    });
  }

  // Sort: overdue first, then soonest upcoming
  results.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  return { payments: results };
}

// ============================================================
// 8. ADMIN MASTER GRID & AGILITY SYNC
// ============================================================

function getAdminMasterGrid(token, offset, limit) {
  requireAdmin_(token);
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const payData = ss.getSheetByName('PAYMENTS').getDataRange().getValues();
  const payMap = new Map(payData.slice(1).map(r => [r[1], r]));
  
  let grid = [];
  for (let i = 1; i < custData.length; i++) {
    if(!custData[i][0]) continue;
    grid.push({
      id: custData[i][0],
      name: custData[i][7] || `${custData[i][5]} ${custData[i][6]}`,
      cellNumber: custData[i][8] || '',
      agent: custData[i][30],
      status: custData[i][32],
      orderDate: formatDateSafe_(custData[i][15]),
      createdDate: formatDateSafe_(custData[i][2]),
      nextActionDate: formatDateSafe_(custData[i][34]),
      payStatus: (payMap.get(custData[i][0]) || [])[2] || 'Pending'
    });
  }
  return { data: grid.reverse().slice(offset, offset + limit), total: grid.length };
}

function runAgilitySync(token) {
  requireAdmin_(token);
  const agilitySheet = ss.getSheetByName('Agility REPORT');
  if (!agilitySheet) throw new Error("Agility REPORT sheet not found.");
  
  const agilityData = agilitySheet.getDataRange().getValues();
  const headers = agilityData[0];
  
  const SYNC_COL_INDEX = headers.indexOf('Sync_Status');
  const CUSTOMER_COL_INDEX = headers.indexOf('customer');
  const PRODUCT_COL_INDEX = headers.indexOf('contractproductname');
  const AGENT_COL_INDEX = headers.indexOf('channel_partner_user_name');
  
  if (SYNC_COL_INDEX === -1) throw new Error("Could not find 'Sync_Status' column header.");
  
  const syncStatusArray = agilitySheet.getRange(1, SYNC_COL_INDEX + 1, agilityData.length, 1).getValues();
  const orderData = ss.getSheetByName('ORDERS').getDataRange().getValues();
  const existingOvrMap = new Map();
  const existingOvkMap = new Map();
  
  for (let i = 1; i < orderData.length; i++) {
    if (orderData[i][4]) existingOvrMap.set(orderData[i][4], orderData[i][1]);
    if (orderData[i][5]) existingOvkMap.set(orderData[i][5], orderData[i][1]);
  }
    
  let newLeads = 0; let updatedLeads = 0;
  const timestamp = new Date().toISOString();
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const newCust = []; const newOrd = []; const newPay = []; const newAct = [];
    
  for (let i = 1; i < agilityData.length; i++) {
    if (syncStatusArray[i][0] === 'Synced') continue;
    
    const row = agilityData[i];
    const description = String(row[10] || '');
    const match = description.match(/(OVR|OVK)-[A-Z0-9-]+/i);
    
    if (match) {
      const orderNum = match[0].toUpperCase();
      const isOvr = orderNum.startsWith('OVR');
      let customerId = isOvr ? existingOvrMap.get(orderNum) : existingOvkMap.get(orderNum);
      if (customerId) {
        updatedLeads++;
      } else {
        customerId = 'CUS-' + Utilities.getUuid().slice(0, 8).toUpperCase();
        
        let agentName = '';
        if (AGENT_COL_INDEX !== -1 && row[AGENT_COL_INDEX]) {
            agentName = String(row[AGENT_COL_INDEX]).trim();
        }
        
        const isPaid = !!row[5];
        const isActivated = String(row[11] || '').toLowerCase().includes('activated');
        let fullName = "Agility Import";
        if (CUSTOMER_COL_INDEX !== -1 && row[CUSTOMER_COL_INDEX]) {
            fullName = String(row[CUSTOMER_COL_INDEX]).trim();
        }
        let nameParts = fullName.split(' ');
        let firstName = nameParts[0];
        let surname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown';
          
        let rawProduct = "";
        let mappedPackage = "Other";
        if (PRODUCT_COL_INDEX !== -1 && row[PRODUCT_COL_INDEX]) {
            rawProduct = String(row[PRODUCT_COL_INDEX]).toLowerCase();
            if (rawProduct.includes("fttr-20-10")) mappedPackage = "Vuma Reach 20Mbps/10Mbps";
            else if (rawProduct.includes("fttr-10-10")) mappedPackage = "Vuma Reach 10Mbps/10Mbps";
        }
          
        newCust.push([
          customerId, 'Active', timestamp, (agentName || 'Agility System'), timestamp,
          firstName, surname, fullName, '0000000000', '', '', 'Address Missing', 'Area Missing', mappedPackage,
          '', todayStr, '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Agility System', '',
          'New Lead', 'Call Back', todayStr, '', todayStr, 'Auto-Imported'
        ]);
        
        newOrd.push([
          'ORD-' + Utilities.getUuid().slice(0,8), customerId, fullName, todayStr, (isOvr ? orderNum : ''), (!isOvr ? orderNum : ''),
          (agentName || 'Agility System'), row[11] || 'Imported via Agility', 'Update Missing Info', todayStr, todayStr, 'Auto-Imported'
        ]);
        
        newPay.push(['PAY-' + Utilities.getUuid().slice(0,8), customerId, (isPaid ? 'Paid' : 'Pending'), '', (isPaid ? row[5] : ''), (isPaid ? timestamp : '')]);
        newAct.push(['ACT-' + Utilities.getUuid().slice(0,8), customerId, (isActivated ? 'Activated' : 'Pending'), (isActivated ? todayStr : ''), (isActivated ? timestamp : '')]);
        
        if (isOvr) existingOvrMap.set(orderNum, customerId);
        else existingOvkMap.set(orderNum, customerId);
        newLeads++;
      }
    }
    syncStatusArray[i][0] = 'Synced';
  }
  if(newCust.length > 0) ss.getSheetByName('CUSTOMERS').getRange(ss.getSheetByName('CUSTOMERS').getLastRow() + 1, 1, newCust.length, newCust[0].length).setValues(newCust);
  if(newOrd.length > 0) ss.getSheetByName('ORDERS').getRange(ss.getSheetByName('ORDERS').getLastRow() + 1, 1, newOrd.length, newOrd[0].length).setValues(newOrd);
  if(newPay.length > 0) ss.getSheetByName('PAYMENTS').getRange(ss.getSheetByName('PAYMENTS').getLastRow() + 1, 1, newPay.length, newPay[0].length).setValues(newPay);
  if(newAct.length > 0) ss.getSheetByName('ACTIVATIONS').getRange(ss.getSheetByName('ACTIVATIONS').getLastRow() + 1, 1, newAct.length, newAct[0].length).setValues(newAct);
  agilitySheet.getRange(1, SYNC_COL_INDEX + 1, syncStatusArray.length, 1).setValues(syncStatusArray);
  return { success: true, newLeads, updatedLeads };
}

// ============================================================
// 9. AGENT CRUD (Admin only)
// ============================================================

function getAgentList(token) {
  requireAdmin_(token);
  const sheet = ss.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  const agents = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    agents.push({
      agentId:  String(data[i][0]),
      name:     String(data[i][1] || ''),
      email:    String(data[i][2] || ''),
      role:     String(data[i][5] || 'Agent'),
      status:   String(data[i][6] || 'Pending'),
      tempPass: String(data[i][7] || '')
    });
  }
  return { agents };
}

function createAgent(token, payload) {
  requireAdmin_(token);
  const { name, email, password, role } = payload;
  if (!name || !email || !password) throw new Error('Name, email and password are required.');

  const sheet = ss.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase().trim() === email.toLowerCase().trim()) {
      throw new Error('An account with this email already exists.');
    }
  }

  const agentId  = 'AGT-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const salt     = Utilities.getUuid();
  const hash     = hashPassword(password, salt);
  const created  = new Date().toISOString();

  sheet.appendRow([agentId, name.trim(), email.trim().toLowerCase(), hash, salt, role || 'Agent', 'Verified', '', created]);
  return { success: true, agentId };
}

function updateAgent(token, payload) {
  requireAdmin_(token);
  const { agentId, name, email, role, status } = payload;
  if (!agentId) throw new Error('agentId is required.');

  const sheet = ss.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  const rowIdx = data.findIndex(r => String(r[0]) === String(agentId));
  if (rowIdx < 1) throw new Error('Agent not found.');

  const sheetRow = rowIdx + 1;
  if (name)   sheet.getRange(sheetRow, 2).setValue(name.trim());
  if (email)  sheet.getRange(sheetRow, 3).setValue(email.trim().toLowerCase());
  if (role)   sheet.getRange(sheetRow, 6).setValue(role);
  if (status) sheet.getRange(sheetRow, 7).setValue(status);

  return { success: true };
}

function setAgentTempPassword(token, payload) {
  requireAdmin_(token);
  const { agentId, tempPassword } = payload;
  if (!agentId || !tempPassword) throw new Error('agentId and tempPassword are required.');

  const sheet  = ss.getSheetByName('Users');
  const data   = sheet.getDataRange().getValues();
  const rowIdx = data.findIndex(r => String(r[0]) === String(agentId));
  if (rowIdx < 1) throw new Error('Agent not found.');

  const sheetRow = rowIdx + 1;
  const salt     = Utilities.getUuid();
  const hash     = hashPassword(tempPassword, salt);

  sheet.getRange(sheetRow, 4).setValue(hash);
  sheet.getRange(sheetRow, 5).setValue(salt);
  sheet.getRange(sheetRow, 8).setValue(tempPassword);
  sheet.getRange(sheetRow, 7).setValue('Verified');

  return { success: true, tempPassword };
}

function deleteAgent(token, agentId) {
  requireAdmin_(token);
  if (!agentId) throw new Error('agentId is required.');

  const sheet  = ss.getSheetByName('Users');
  const data   = sheet.getDataRange().getValues();
  const rowIdx = data.findIndex(r => String(r[0]) === String(agentId));
  if (rowIdx < 1) throw new Error('Agent not found.');

  sheet.getRange(rowIdx + 1, 7).setValue('Inactive');
  return { success: true };
}
