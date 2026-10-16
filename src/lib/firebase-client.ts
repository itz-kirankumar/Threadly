"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Public Firebase web client identifiers for Wisentry (project: wisentry-510811)
export const defaultFirebaseConfig = {
  apiKey: "AIzaSyBh_cw7QS00FX2ZwaGtNnuiNhXaVWbdYWM",
  authDomain: "wisentry-510811.firebaseapp.com",
  databaseURL: "https://wisentry-510811-default-rtdb.firebaseio.com",
  projectId: "wisentry-510811",
  storageBucket: "wisentry-510811.firebasestorage.app",
  messagingSenderId: "440715891811",
  appId: "1:440715891811:web:c9621931ac20513a8c5456",
  measurementId: "G-L48YZPBZ7B",
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || defaultFirebaseConfig.databaseURL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || defaultFirebaseConfig.measurementId,
};

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL || !firebaseConfig.projectId) {
    throw new Error("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE settings and restart the app.");
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export async function initializeFirebaseAnalytics() {
  if (typeof window === "undefined") return;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (await isSupported()) getAnalytics(getFirebaseApp());
}
