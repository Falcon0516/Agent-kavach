import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database"; // Realtime Database (kept for backward compat)
import { getFirestore, collection, onSnapshot, doc } from "firebase/firestore"; // Firestore (new)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Realtime Database (existing — backward compat)
export const database = getDatabase(app);

// Firestore (new — for zones, threats, community reports)
export const firestore = getFirestore(app);
