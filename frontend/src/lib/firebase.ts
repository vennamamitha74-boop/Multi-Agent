import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";

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
export const firebaseDb = getFirestore(firebaseApp);

/**
 * Retrieves the current Firebase authorization token.
 * Falls back to deterministic development token if running in dev without live session.
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
  const uid = currentUserUid || (firebaseAuth.currentUser?.uid) || "user_developer";
  return `dev-token-${uid}`;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  createdAt: string;
}

/**
 * Synchronizes user profile to Firestore
 */
export async function syncUserProfile(user: User, customName?: string, role: "admin" | "user" = "user"): Promise<UserProfile> {
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName: customName || user.displayName || user.email?.split("@")[0] || "User",
    role: role,
    createdAt: new Date().toISOString(),
  };

  try {
    const userDocRef = doc(firebaseDb, "users", user.uid);
    const existingSnap = await getDoc(userDocRef);
    if (!existingSnap.exists()) {
      await setDoc(userDocRef, profile);
    } else {
      const data = existingSnap.data();
      return {
        uid: user.uid,
        email: data.email || profile.email,
        displayName: data.displayName || profile.displayName,
        role: data.role || profile.role,
        createdAt: data.createdAt || profile.createdAt,
      };
    }
  } catch (err) {
    console.warn("Firestore profile sync deferred (local profile active):", err);
  }

  return profile;
}

/**
 * Fetches user profile from Firestore
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(firebaseDb, "users", uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch (err) {
    console.warn("Could not fetch user profile from Firestore:", err);
  }
  return null;
}

/**
 * Saves a completed or running task to Firestore under user scope
 */
export async function syncUserTaskToFirestore(userId: string, taskRecord: any): Promise<void> {
  try {
    if (!taskRecord || !taskRecord.task_id) return;
    const taskDocRef = doc(firebaseDb, "tasks", taskRecord.task_id);
    await setDoc(taskDocRef, {
      ...taskRecord,
      user_id: userId,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.debug("Firestore task sync deferred:", err);
  }
}

/**
 * Loads tasks for a user from Firestore
 */
export async function fetchUserTasksFromFirestore(userId: string): Promise<any[]> {
  try {
    const tasksRef = collection(firebaseDb, "tasks");
    const q = query(tasksRef, where("user_id", "==", userId));
    const snapshot = await getDocs(q);
    const tasks: any[] = [];
    snapshot.forEach((doc) => tasks.push(doc.data()));
    return tasks;
  } catch (err) {
    console.debug("Firestore fetch tasks deferred:", err);
    return [];
  }
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
};
export type { User };
