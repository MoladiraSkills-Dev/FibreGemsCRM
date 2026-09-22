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
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain', // Required for GAS CORS
      },
      body: JSON.stringify({
        action: action,
        payload: payload,
        token: session ? session.token : null
      })
    });

    const result = await response.json();
    if (result.status === 'error') throw new Error(result.message);
    return result.data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}
