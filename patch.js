const fs = require('fs');
const path = 'c:\\Users\\User\\Downloads\\static\\FibreGemsCRM\\Code.gs';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    'let newLeads = 0; let updatedLeads = 0; let skipped = 0;',
    'let newLeads = 0; let updatedLeads = 0; let skipped = 0;\n    let debugSkipReasons = {};'
);

code = code.replace(
    'return { success: true, newLeads, updatedLeads, skipped };',
    'return { success: true, newLeads, updatedLeads, skipped, debugSkipReasons };'
);

const old_date_re = /\/\/\s*Date filter[^\n]*\n\s*const createdRaw = row\[COL_CREATED\];\n\s*if \(\!createdRaw\) \{ skipped\+\+; continue; \}\n\s*const createdDate = \(createdRaw instanceof Date\) \? createdRaw : new Date\(createdRaw\);\n\s*if \(isNaN\(createdDate\.getTime\(\)\) \|\| createdDate < AUG_2026\) \{ skipped\+\+; continue; \}/;

const new_date = `// Date filter
    const createdRaw = row[COL_CREATED];
    if (!createdRaw) { skipped++; debugSkipReasons.noDate = (debugSkipReasons.noDate||0)+1; continue; }
    
    let createdDate = createdRaw;
    if (!(createdRaw instanceof Date)) {
      let ds = String(createdRaw).trim();
      let m = ds.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
      if (m) {
        createdDate = new Date(\`\${m[3]}-\${m[2]}-\${m[1]}T00:00:00Z\`);
      } else {
        createdDate = new Date(createdRaw);
      }
    }
    
    if (isNaN(createdDate.getTime()) || createdDate < AUG_2026) { 
      skipped++; 
      debugSkipReasons.oldDate = (debugSkipReasons.oldDate||0)+1; 
      continue; 
    }`;

code = code.replace(old_date_re, new_date);

const old_order_re = /if \(\!orderNum\) \{ skipped\+\+; continue; \}[^\n]*/;
const new_order = 'if (!orderNum) { skipped++; debugSkipReasons.noOrderRef = (debugSkipReasons.noOrderRef||0)+1; continue; }';

code = code.replace(old_order_re, new_order);

fs.writeFileSync(path, code, 'utf8');
console.log("Replacement successful");
