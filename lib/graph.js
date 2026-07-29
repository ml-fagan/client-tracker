import { ConfidentialClientApplication } from "@azure/msal-node";

// Same service-principal read as the production widget. Reads the production
// schedule file from SharePoint using app-only auth (Sites.Selected, read-only).
// Uses the SAME Azure app registration credentials as the production widget.

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

const SITE_HOSTNAME = "decorsystems.sharepoint.com";
const SITE_PATH = "/sites/Projects";
const FILE_PATH = "/- OTHER/Jordan/Production Schedule 2026 Current.xlsx";

let cca = null;
function client() {
  if (!cca) {
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("Missing Azure credentials.");
    }
    cca = new ConfidentialClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET,
      },
    });
  }
  return cca;
}

async function token() {
  const result = await client().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire Graph token.");
  return result.accessToken;
}

async function graphGet(url, accessToken, asBuffer = false) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph GET ${res.status}: ${body.slice(0, 300)}`);
  }
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

export async function downloadScheduleBuffer() {
  const accessToken = await token();
  const site = await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${SITE_HOSTNAME}:${SITE_PATH}`,
    accessToken
  );
  const encodedPath = FILE_PATH.split("/").map(encodeURIComponent).join("/");
  const item = await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:${encodedPath}`,
    accessToken
  );
  const buffer = await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${item.id}/content`,
    accessToken,
    true
  );
  return { buffer, lastModified: item.lastModifiedDateTime };
}
