$path = "c:\Users\User\Downloads\static\FibreGemsCRM\agent\agent.js"
$content = [System.IO.File]::ReadAllText($path)

$content = $content -replace "(?s)let worklistOffset = 0;\r?\nconst WORKLIST_LIMIT = 20;\r?\nlet worklistTotal = 0;", "let worklistOffset = 0;`nlet WORKLIST_LIMIT = 20;`nlet worklistTotal = 0;"

$oldCB = "(?s)  let listToDisplay = allCallbacks;\r?\n  if \(currentCallbackFilter === 'pending'\) listToDisplay = pendingCallbacks;\r?\n  else if \(currentCallbackFilter === 'completed'\) listToDisplay = doneCallbacks;\r?\n\r?\n  if \(listToDisplay\.length === 0\) {"
$newCB = @'
  let listToDisplay = allCallbacks;
  if (currentCallbackFilter === 'pending') listToDisplay = pendingCallbacks;
  else if (currentCallbackFilter === 'completed') listToDisplay = doneCallbacks;

  const st = (document.getElementById('callback-search')?.value || '').toLowerCase();
  if (st) {
    listToDisplay = listToDisplay.filter(c => {
         return (c.name || '').toLowerCase().includes(st) || 
                (c.cellNumber || '').toString().includes(st) || 
                (c.alternateCell || '').toString().includes(st) || 
                (c.customerId || '').toLowerCase().includes(st) ||
                (c.orderNumber || '').toLowerCase().includes(st) ||
                (c.easyPayNumber || '').toLowerCase().includes(st) ||
                (c.package || '').toLowerCase().includes(st) ||
                (c.status || '').toLowerCase().includes(st);
    });
  }

  if (listToDisplay.length === 0) {
'@
$content = $content -replace $oldCB, $newCB

$oldWL = "(?s)  try {\r?\n    const result = await callBackend\('getAgentWorklist', { offset: worklistOffset, limit: WORKLIST_LIMIT }\);\r?\n    worklistTotal = result\.total;\r?\n    countEl\.textContent = `\$\{result\.total\} customer\$\{result\.total !== 1 \? 's' : ''\}`;\r?\n\r?\n    if \(result\.data\.length === 0\) {\r?\n      tbody\.innerHTML = `\r?\n        <tr><td colspan=""7"" class=""px-6 py-16 text-center text-gray-400"">\r?\n          <p class=""font-medium"">No leads in your general pipeline</p>\r?\n        </td></tr>`;\r?\n      updatePagination\(\);\r?\n      return;\r?\n    }\r?\n\r?\n    tbody\.innerHTML = result\.data\.map\(c => {"

$newWL = @'
  try {
    const st = (document.getElementById('worklist-search')?.value || '').toLowerCase();
    const currentLimit = st ? 1000 : WORKLIST_LIMIT; // Fetch all if searching
    const result = await callBackend('getAgentWorklist', { offset: worklistOffset, limit: currentLimit, search: st });
    worklistTotal = result.total;
    countEl.textContent = `${result.total} customer${result.total !== 1 ? 's' : ''}`;

    let data = result.data || [];
    if (st) {
      data = data.filter(c => {
        return (c.name || '').toLowerCase().includes(st) || 
               (c.cellNumber || '').toString().includes(st) || 
               (c.customerId || '').toLowerCase().includes(st) ||
               (c.orderNumber || '').toLowerCase().includes(st) ||
               (c.status || '').toLowerCase().includes(st) ||
               (c.package || '').toLowerCase().includes(st);
      });
    }

    if (data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="px-6 py-16 text-center text-gray-400">
          <p class="font-medium">No leads matching search</p>
        </td></tr>`;
      updatePagination();
      return;
    }

    tbody.innerHTML = data.map(c => {
'@
$content = $content -replace $oldWL, $newWL

$oldPagi = "(?s)function updatePagination\(\) {\r?\n  const paginationEl = document\.getElementById\('pagination'\);\r?\n  const totalPages = Math\.ceil\(worklistTotal / WORKLIST_LIMIT\);\r?\n  const currentPage = Math\.floor\(worklistOffset / WORKLIST_LIMIT\) \+ 1;\r?\n\r?\n  if \(totalPages <= 1\) {"

$newPagi = @'
let worklistSearchTimeout = null;
function handleWorklistSearch() {
  if (worklistSearchTimeout) clearTimeout(worklistSearchTimeout);
  worklistSearchTimeout = setTimeout(() => {
    worklistOffset = 0;
    loadWorklist();
  }, 400);
}

function updatePagination() {
  const paginationEl = document.getElementById('pagination');
  const totalPages = Math.ceil(worklistTotal / WORKLIST_LIMIT);
  const currentPage = Math.floor(worklistOffset / WORKLIST_LIMIT) + 1;
  const st = (document.getElementById('worklist-search')?.value || '');

  if (totalPages <= 1 || st) {
'@
$content = $content -replace $oldPagi, $newPagi

[System.IO.File]::WriteAllText($path, $content)
