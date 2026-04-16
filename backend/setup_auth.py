"""
setup_auth.py
=============
Run this ONCE to authorize your Google account using the
credentials JSON file you downloaded from Google Cloud Console.

After running, it saves a token.json file that python_server.py
uses automatically (with auto-refresh when expired).

USAGE
─────
1. Rename your downloaded credentials JSON to: client_credentials.json
(or change CREDENTIALS_FILE below to match your filename)

2. Run:
python setup_auth.py

3. A browser window will open → Sign in with your Google account
→ Click "Allow"

4. token.json is saved. You're done. Start python_server.py.

INSTALL
───────
pip install google-auth-oauthlib
"""

import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

# ── CHANGE THIS if your file has a different name ─────────────
CREDENTIALS_FILE = "client_credentials.json"
TOKEN_FILE = "token.json"

# Scopes needed for Google Cloud Vision API
SCOPES = ["https://www.googleapis.com/auth/cloud-vision"]


def main():
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"ERROR: '{CREDENTIALS_FILE}' not found.")
        print()
        print("Steps to fix:")
        print("  1. Go to console.cloud.google.com")
        print("  2. Select your project")
        print("  3. APIs & Services → Credentials")
        print("  4. Download your OAuth2 client JSON")
        print(f"  5. Rename it to '{CREDENTIALS_FILE}' in this folder")
        return

    print(f"Reading credentials from: {CREDENTIALS_FILE}")
    print("A browser window will open for Google sign-in...")
    print()

    # Load the credentials JSON
    # The file may be nested under "web" or "installed" key
    with open(CREDENTIALS_FILE) as f:
        raw = json.load(f)

    # Detect format and normalize
    if "web" in raw or "installed" in raw:
        # Standard OAuth2 client format — use directly
        flow = InstalledAppFlow.from_client_secrets_file(
            CREDENTIALS_FILE, scopes=SCOPES
        )
    else:
        # Flat format (client_id, client_secret, etc. at top level)
        # Wrap it into the "installed" format that google-auth-oauthlib expects
        wrapped = {
            "installed": {
                "client_id": raw["client_id"],
                "client_secret": raw["client_secret"],
                "project_id": raw.get("project_id", ""),
                "auth_uri": raw.get("auth_uri", "https://accounts.google.com/o/oauth2/auth"),
                "token_uri": raw.get("token_uri", "https://oauth2.googleapis.com/token"),
                "auth_provider_x509_cert_url": raw.get(
                    "auth_provider_x509_cert_url",
                    "https://www.googleapis.com/oauth2/v1/certs"
                ),
                "redirect_uris": ["http://localhost"],
            }
        }
        # Save wrapped version temporarily
        temp_file = "_temp_credentials.json"
        with open(temp_file, "w") as f:
            json.dump(wrapped, f)
        flow = InstalledAppFlow.from_client_secrets_file(temp_file, scopes=SCOPES)
        os.remove(temp_file)

    # Run local server OAuth flow (opens browser automatically)
    creds = flow.run_local_server(port=0)

    # Save token to token.json
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else [],
    }

    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f, indent=2)

    print()
    print(f"✅ Authorization successful! Token saved to '{TOKEN_FILE}'")
    print()
    print("You can now start the server:")
    print("  python python_server.py")


if __name__ == "__main__":
    main()