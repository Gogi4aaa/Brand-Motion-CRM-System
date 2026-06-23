"use client";

import { useEffect } from "react";
import { useStore } from "./store";

// Registers the service worker and a Web Push subscription for the signed-in
// user. Does nothing until NEXT_PUBLIC_VAPID_PUBLIC_KEY is set, so it's inert
// until web push is configured.
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushInit() {
  const { registerPush, currentUser } = useStore();

  useEffect(() => {
    if (!VAPID || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission === "default") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") return;
        } else if (Notification.permission !== "granted") {
          return;
        }
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) }));
        if (!cancelled) registerPush(sub.toJSON());
      } catch (e) {
        console.error("[BrandMotion] push init failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [registerPush, currentUser.initials]);

  return null;
}
