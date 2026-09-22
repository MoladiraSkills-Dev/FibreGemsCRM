/**
 * FibreGems CRM — API Client
 * Fetch wrapper for GitHub Pages → Apps Script REST communication.
 */

const API_URL = "https://script.google.com/macros/s/AKfycbyn0YWvIPLiVnY8Jt6nk-3nqbByDrjbH4P0v70W0DfUiGsivfR7QvJkuDdEnaIV0tvf/exec"; // Replace with your Web App URL

// Volatile session — lives only in JS memory. Refresh = logout.
let session = null;

/**
 * Universal fetch wrapper for the doPost router.
 * Uses Content-Type: text/plain to avoid CORS preflight on Apps Script.
 */
async function callBackend(action, payload = {}) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain', // text/plain avoids CORS preflight
      },
      body: JSON.stringify({
        action: action,
        payload: payload,
        token: session ? session.token : null
      })
    });
  } catch (networkError) {
    // This fires when the browser blocks the response (CORS) or there's no network
    console.error("Network/CORS Error:", networkError);
    throw new Error(
      "Cannot reach the server. Check that your Apps Script Web App is deployed with access set to \"Anyone\" (not \"Anyone with Google account\")."
    );
  }

  // If we got a response but it's not OK (e.g. 401, 403, 404)
  if (!response.ok) {
    console.error("HTTP Error:", response.status, response.statusText);
    throw new Error(`Server returned ${response.status}. Re-deploy your Apps Script Web App.`);
  }

  let result;
  try {
    result = await response.json();
  } catch (parseError) {
    console.error("JSON Parse Error — server may have returned an HTML error page");
    throw new Error("Unexpected server response. Check the Apps Script execution log for errors.");
  }

  if (result.status === 'error') {
    throw new Error(result.message || 'Unknown server error.');
  }

  return result.data;
}
