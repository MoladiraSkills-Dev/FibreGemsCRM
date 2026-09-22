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
      default:
        throw new Error("Invalid API action requested.");
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
// 2. CORE FUNCTIONS
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

// ============================================================
// 3. AGENT LEAD CAPTURE & UPDATE
// ============================================================

function handleAgentLeadUpdate(existingIdOverride, formData, token) {
  const session = getSessionUser(token);
  const timestamp = new Date().toISOString();
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  
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
  
  let customerId = existingIdOverride;
  if(!customerId) {
    // New lead — insert across all tables
    customerId = 'CUS-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    custSheet.appendRow([
      customerId, 'Active', timestamp, session.agentId, timestamp, formData.firstName, formData.surname, `${formData.firstName} ${formData.surname}`,
      formData.cellNumber, formData.alternateCell, formData.email, formData.address, formData.suburb, formData.package || "", formData.paymentType || "",
      formData.orderDate || "", "", "", "", "", "", "", "", formData.promisedPaymentDate || "", "", "", "", "", "", session.agentId, session.agentId, "",
      formData.customerStatus || "New Lead", formData.nextAction || "", formData.nextActionDate || "", "", todayStr, formData.lastContactOutcome || ""
    ]);
    ss.getSheetByName('ORDERS').appendRow(['ORD-' + Utilities.getUuid().slice(0,8), customerId, `${formData.firstName} ${formData.surname}`, formData.orderDate||"", '', '', '', '', '', '']);
    ss.getSheetByName('PAYMENTS').appendRow(['PAY-' + Utilities.getUuid().slice(0,8), customerId, 'Pending', formData.promisedPaymentDate||"", '', '']);
    ss.getSheetByName('ACTIVATIONS').appendRow(['ACT-' + Utilities.getUuid().slice(0,8), customerId, 'Pending', '', '']);
  } else {
    // Update existing lead
    let rowIndex = custData.findIndex(r => r[0] === customerId) + 1;
    if(rowIndex > 0) {
      custSheet.getRange(rowIndex, 5, 1, 9).setValues([[timestamp, formData.firstName, formData.surname, `${formData.firstName} ${formData.surname}`, formData.cellNumber, formData.alternateCell, formData.email, formData.address, formData.suburb]]);
      custSheet.getRange(rowIndex, 14, 1, 2).setValues([[formData.package || "", formData.paymentType || ""]]);
      custSheet.getRange(rowIndex, 33, 1, 3).setValues([[formData.customerStatus, formData.nextAction, formData.nextActionDate]]);
    }
  }
  
  // Audit log
  ss.getSheetByName('ACTIVITY_LOG').appendRow(['ACT-' + Utilities.getUuid().substring(0, 8).toUpperCase(), timestamp, customerId, `${formData.firstName} ${formData.surname}`, session.agentId, existingIdOverride ? "Lead Overwritten" : "Lead Captured", "Web Portal", formData.lastContactOutcome||"", formData.customerStatus||"", formData.promisedPaymentDate || "", formData.nextAction||"", formData.nextActionDate||"", "False", "None", "", "", session.agentId, timestamp]);
  return { success: true, customerId: customerId };
}

// ============================================================
// 4. AGENT WORKLIST
// ============================================================

function getAgentWorklist(token, offset, limit) {
  const session = getSessionUser(token);
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const actData  = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues();

  // Build a map of agentId → { customerId → latest activity row }
  // Only include activity rows where THIS agent is the logger (col 4 = Agent_ID or col 16 = Logged_By_Agent_ID)
  const agentActivityMap = {}; // customerId → latest activity row for this agent
  for (let i = 1; i < actData.length; i++) {
    const row = actData[i];
    const rowAgentId      = String(row[4]  || '').trim();
    const rowLoggedById   = String(row[16] || '').trim();
    const customerId      = String(row[2]  || '').trim();
    if (!customerId) continue;
    if (rowAgentId !== session.agentId && rowLoggedById !== session.agentId) continue;
    // Keep the most recent entry per customer (rows are appended chronologically)
    agentActivityMap[customerId] = row;
  }

  let worklist = [];
  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const custId    = String(row[0] || '').trim();
    const assignedAgent = String(row[30] || '').trim();
    if (custData[i][1] === 'Archived') continue;

    // Include customer if assigned to this agent OR if this agent has any activity logged for them
    const ownsCustomer   = assignedAgent === session.agentId;
    const hasActivity    = !!agentActivityMap[custId];
    if (!ownsCustomer && !hasActivity) continue;

    let naDate = row[34];
    if (naDate && naDate instanceof Date) {
      naDate = Utilities.formatDate(naDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }

    // Enrich with the agent's latest activity for this customer
    const lastAct = agentActivityMap[custId];
    let lastContactDate = '';
    let lastActionType  = '';
    let lastOutcome     = '';
    if (lastAct) {
      let actDate = lastAct[1];
      if (actDate && actDate instanceof Date) {
        lastContactDate = Utilities.formatDate(actDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else if (actDate) {
        lastContactDate = String(actDate).slice(0, 10);
      }
      lastActionType = String(lastAct[5] || '').trim();
      lastOutcome    = String(lastAct[7] || '').trim();
    }

    worklist.push({
      customerId:      custId,
      name:            row[7],
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

// Returns paginated ACTIVITY_LOG rows for the logged-in agent only
function getAgentActivityLog(token, offset, limit) {
  const session  = getSessionUser(token);
  const actData  = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues();
  const headers  = actData[0];
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
      nextActionDate:String(row[11] || ''),
      notes:         String(row[15] || '')
    });
  }
  rows.reverse(); // newest first
  return { data: rows.slice(offset, offset + limit), total: rows.length };
}

// ============================================================
// 5. QUICK UPDATE
// ============================================================

function quickUpdateSalesData(customerId, payload, token) {
  const session = getSessionUser(token);
  const custSheet = ss.getSheetByName('CUSTOMERS');
  const custData = custSheet.getDataRange().getValues();
  let rowIndex = custData.findIndex(r => r[0] === customerId && r[30] === session.agentId) + 1;
  if (rowIndex === 0) throw new Error("Unauthorized or Customer not found.");
  custSheet.getRange(rowIndex, 14).setValue(payload.package);
  custSheet.getRange(rowIndex, 33, 1, 3).setValues([[payload.status, payload.nextAction, payload.nextActionDate]]);  
  ss.getSheetByName('ACTIVITY_LOG').appendRow(['ACT-' + Utilities.getUuid().substring(0,8).toUpperCase(), new Date(), customerId, custData[rowIndex-1][7], session.agentId, "Quick Edit", "", "", payload.status, "", payload.nextAction, payload.nextActionDate, "", "", "", "", session.agentId, new Date()]);
  return {success: true};
}

// ============================================================
// 6. ADMIN DASHBOARD
// ============================================================

function getAdminDashboard(token) {
  getSessionUser(token);
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const activityData = ss.getSheetByName('ACTIVITY_LOG').getDataRange().getValues().slice(1);
  const userMap = new Map(ss.getSheetByName('Users').getDataRange().getValues().slice(1).map(u => [u[0], {name: u[1], role: u[5]}]));
  
  const agentStats = {};
  activityData.forEach(row => {
    let logDate = new Date(row[1]);
    if (Utilities.formatDate(logDate, Session.getScriptTimeZone(), "yyyy-MM-dd") === todayStr) {
      const aid = row[4];
      if (!agentStats[aid]) agentStats[aid] = { count: 0, lastActivity: logDate };
      agentStats[aid].count++;
      if (logDate > agentStats[aid].lastActivity) agentStats[aid].lastActivity = logDate;
    }
  });
  const agents = Object.keys(agentStats).map(aid => ({
    name: userMap.get(aid)?.name || 'Unknown',
    role: userMap.get(aid)?.role || 'Agent',
    touches: agentStats[aid].count,
    lastActive: agentStats[aid].lastActivity
  })).sort((a,b) => b.lastActive - a.lastActive);
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues().slice(1);
  const statuses = custData.reduce((acc, row) => { const stat = row[32] || 'Unknown'; acc[stat] = (acc[stat] || 0) + 1; return acc; }, {});
  
  return { activeCount: agents.length, agents, statuses };
}

// ============================================================
// 7. ADMIN MASTER GRID
// ============================================================

function getAdminMasterGrid(token, offset, limit) {
  getSessionUser(token);
  const custData = ss.getSheetByName('CUSTOMERS').getDataRange().getValues();
  const payData = ss.getSheetByName('PAYMENTS').getDataRange().getValues();
  const payMap = new Map(payData.slice(1).map(r => [r[1], r]));
  
  let grid = [];
  for (let i = 1; i < custData.length; i++) {
    if(!custData[i][0]) continue;
    grid.push({
      id: custData[i][0], name: custData[i][7], agent: custData[i][30],
      status: custData[i][32], payStatus: (payMap.get(custData[i][0]) || [])[2] || 'Pending'
    });
  }
  return { data: grid.reverse().slice(offset, offset + limit), total: grid.length };
}

// ============================================================
// 8. AGILITY SYNC ENGINE
// ============================================================

function runAgilitySync(token) {
  const session = getSessionUser(token);
  if (session.role !== 'Admin') throw new Error("Only Admins can trigger the Agility Sync.");
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
  const usersData = ss.getSheetByName('Users').getDataRange().getValues();
  const agentMap = new Map(usersData.slice(1).map(u => [String(u[1]).toLowerCase().trim(), u[0]]));
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
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
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

function requireAdmin_(token) {
  const s = getSessionUser(token);
  if (s.role !== 'Admin') throw new Error('Admin privileges required.');
  return s;
}

/** Returns all users from the Users sheet (safe fields only). */
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
      tempPass: String(data[i][7] || '')   // temp password (plain-text, shown once)
    });
  }
  return { agents };
}

/** Creates a new agent account with a hashed password. */
function createAgent(token, payload) {
  requireAdmin_(token);
  const { name, email, password, role } = payload;
  if (!name || !email || !password) throw new Error('Name, email and password are required.');

  const sheet = ss.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();

  // Duplicate email check
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase().trim() === email.toLowerCase().trim()) {
      throw new Error('An account with this email already exists.');
    }
  }

  const agentId  = 'AGT-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const salt     = Utilities.getUuid();
  const hash     = hashPassword(password, salt);
  const created  = new Date().toISOString();

  // Columns: Agent_ID | Name | Email | PasswordHash | Salt | Role | Status | TempPassword | CreatedAt
  sheet.appendRow([agentId, name.trim(), email.trim().toLowerCase(), hash, salt, role || 'Agent', 'Verified', '', created]);
  return { success: true, agentId };
}

/** Updates an existing agent's name, email, role or status. */
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

/** Sets a temporary plain-text password (also stores hash). Admin can read it once. */
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

  sheet.getRange(sheetRow, 4).setValue(hash);          // PasswordHash
  sheet.getRange(sheetRow, 5).setValue(salt);          // Salt
  sheet.getRange(sheetRow, 8).setValue(tempPassword);  // TempPassword (plain, col H)
  sheet.getRange(sheetRow, 7).setValue('Verified');    // Ensure account is active

  return { success: true, tempPassword };
}

/** Deactivates (soft-deletes) an agent — sets status to Inactive. */
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
