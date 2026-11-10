import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyB0PUSYBvDY0xrB33H9yIO3OfIzuGvqrdE",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "multi-agent-e8d98.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "multi-agent-e8d98",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "multi-agent-e8d98.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "526659044247",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:526659044247:web:0d46a8cc574b1daac6fad2",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);

/**
 * Retrieves the current Firebase authorization token.
 * Falls back to deterministic development token if user is switching profiles locally.
 */
export async function getAuthToken(currentUserUid?: string): Promise<string> {
  try {
    if (firebaseAuth.currentUser) {
      const token = await firebaseAuth.currentUser.getIdToken();
      if (token) return token;
    }
  } catch (err) {
    console.warn("Could not retrieve Firebase token, falling back to profile token:", err);
  }

  // Canonical profile/dev token for deterministic user authentication & isolation
  const uid = currentUserUid || "user_developer";
  return `dev-token-${uid}`;
}

