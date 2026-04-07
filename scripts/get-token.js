/**
 * One-time setup: Get a Google Calendar refresh token
 *
 * Steps:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project (or use existing)
 * 3. Enable "Google Calendar API"
 * 4. Go to Credentials → Create OAuth 2.0 Client ID (Web application)
 * 5. Add redirect URI: http://localhost:4021/auth/callback
 * 6. Copy Client ID and Client Secret into .env
 * 7. Run: node scripts/get-token.js
 * 8. Open the URL it prints, authorize, paste the code back
 */

require("dotenv").config();
const { google } = require("googleapis");
const readline = require("readline");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:4021/auth/callback"
);

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Authorize with graham.romer.1@gmail.com");
console.log("3. Copy the 'code' parameter from the redirect URL\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Paste the authorization code here: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("\n✓ Success! Add this to your .env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`\nFull token response:`, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error("Error getting token:", err.message);
  }
  rl.close();
});
