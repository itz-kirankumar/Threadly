"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Firebase web client config identifies the public project; access is
// enforced by Realtime Database security rules. Values come from the
// environment - no hard-coded fallbacks.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
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

// Optional analytics: initialized only after an explicit "accepted" choice and
// collection-disabled again on withdrawal. Undecided/declined never starts it.
export async function initializeFirebaseAnalytics() {
  if (typeof window === "undefined" || !firebaseConfig.measurementId) return;
  const { analyticsAllowed, CONSENT_CHANGE_EVENT } = await import("@/lib/consent");
  const { getAnalytics, isSupported, setAnalyticsCollectionEnabled } = await import("firebase/analytics");
  if (!(await isSupported())) return;
  let analytics: ReturnType<typeof getAnalytics> | null = null;
  const apply = () => {
    if (analyticsAllowed(window.localStorage)) {
      analytics = analytics ?? getAnalytics(getFirebaseApp());
      setAnalyticsCollectionEnabled(analytics, true);
    } else if (analytics) {
      setAnalyticsCollectionEnabled(analytics, false);
    }
  };
  apply();
  window.addEventListener(CONSENT_CHANGE_EVENT, apply);
  window.addEventListener("storage", apply);
}
