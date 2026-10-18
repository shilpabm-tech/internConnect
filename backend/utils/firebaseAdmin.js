const fs = require("fs");
const path = require("path");
const { initializeApp, cert, applicationDefault, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

// Thrown when no Firebase Admin credentials are configured, so callers can
// answer "password reset is unavailable" instead of crashing.
class FirebaseAdminNotConfiguredError extends Error {
  constructor() {
    super("Firebase Admin credentials are not configured");
    this.name = "FirebaseAdminNotConfiguredError";
    this.code = "firebase-admin/not-configured";
  }
}

// Credentials are read from the environment - never hard-coded, never sent
// to the client. Exactly one of these is needed (checked in this order):
//   FIREBASE_SERVICE_ACCOUNT_JSON  the service-account JSON itself, on one
//                                  line (handy for Render/Heroku-style hosts)
//   FIREBASE_SERVICE_ACCOUNT_PATH  path to the downloaded service-account
//                                  .json file (relative to the backend folder)
//   GOOGLE_APPLICATION_CREDENTIALS the standard Google variable (a file path)
// For local testing with the Firebase Auth Emulator, set
// FIREBASE_AUTH_EMULATOR_HOST instead; the SDK then talks to the emulator and
// needs no credentials.
function loadCredential() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    const account = JSON.parse(rawJson);
    return { credential: cert(account), serviceAccountProject: account.project_id };
  }

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    const resolved = path.resolve(__dirname, "..", filePath);
    const account = JSON.parse(fs.readFileSync(resolved, "utf8"));
    return { credential: cert(account), serviceAccountProject: account.project_id };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { credential: applicationDefault(), serviceAccountProject: undefined };
  }

  return null;
}

// The Firebase project the frontend (src/firebase/firebase.js) signs in to.
const FRONTEND_FIREBASE_PROJECT = "internshala-9e300";

let cachedAuth = null;

function getFirebaseAuth() {
  if (cachedAuth) {
    return cachedAuth;
  }

  if (getApps().length === 0) {
    const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
    const loaded = usingEmulator ? null : loadCredential();

    if (!loaded && !usingEmulator) {
      throw new FirebaseAdminNotConfiguredError();
    }

    // With a real key the project comes from the key itself (override only
    // with FIREBASE_PROJECT_ID). The Admin SDK must point at the SAME
    // Firebase project the frontend signs in to, or every account will look
    // like it does not exist - so say which one is being used.
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      (loaded ? loaded.serviceAccountProject : FRONTEND_FIREBASE_PROJECT);

    initializeApp({
      ...(loaded ? { credential: loaded.credential } : {}),
      ...(projectId ? { projectId } : {}),
    });

    console.log(`Firebase Admin initialised for project "${projectId || "(from credentials)"}"`);
    if (projectId && projectId !== FRONTEND_FIREBASE_PROJECT && !usingEmulator) {
      console.log(
        `WARNING: the frontend uses Firebase project "${FRONTEND_FIREBASE_PROJECT}". ` +
          "Password reset will not find your users unless the service account belongs to that project."
      );
    }
  }

  cachedAuth = getAuth();
  return cachedAuth;
}

module.exports = { getFirebaseAuth, FirebaseAdminNotConfiguredError };
