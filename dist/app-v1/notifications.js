function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function ensureServiceWorker(serviceWorkerUrl) {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker not supported in this browser");
  }
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl);
  return registration;
}

async function getPublicKey(vapidKeyUrl) {
  const res = await fetch(vapidKeyUrl);
  if (!res.ok) throw new Error("Failed to load VAPID public key");
  const data = await res.json();
  return data.key;
}

async function showLocalNotification(title, body, iconUrl) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  await registration.showNotification(title, { body, icon: iconUrl });
}

export function notificationsButton(options = {}) {
  const {
    className = "notifications-link",
    iconOn = "notifications_active",
    iconOff = "notifications",
    titleOn = "Turn off notifications",
    titleOff = "Turn on notifications",
    serviceWorkerUrl = "/sw.js",
    vapidKeyUrl = "/vapid-public-key",
    subscribeUrl = "/subscribe",
    unsubscribeUrl = "/unsubscribe",
    iconUrl = "/favicon.ico",
    welcomeTitle = "Welcome to Wiredove",
    welcomeBody = "Your notifications are on.",
    goodbyeTitle = "Goodbye from Wiredove!",
    goodbyeBody = "Your notifications are off.",
    onStatus,
    onToggle,
  } = options;

  const button = document.createElement("a");
  button.href = "#";
  button.className = className;
  button.title = titleOff;
  button.setAttribute("aria-label", titleOff);

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = iconOff;
  button.appendChild(icon);

  function setStatus(text) {
    if (onStatus) onStatus(text);
  }

  function setState(enabled) {
    button.dataset.enabled = enabled ? "true" : "false";
    icon.textContent = enabled ? iconOn : iconOff;
    const title = enabled ? titleOn : titleOff;
    button.title = title;
    button.setAttribute("aria-label", title);
    if (onToggle) onToggle(enabled);
  }

  async function subscribe() {
    setStatus("requesting permission");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("permission denied");
      return;
    }

    const registration = await ensureServiceWorker(serviceWorkerUrl);
    const key = await getPublicKey(vapidKeyUrl);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    const res = await fetch(subscribeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription),
    });

    if (!res.ok) throw new Error("Subscribe failed");
    setStatus("subscribed");
    setState(true);
    await showLocalNotification(welcomeTitle, welcomeBody, iconUrl);
  }

  async function unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      setStatus("no service worker");
      return;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setStatus("not subscribed");
      return;
    }

    await subscription.unsubscribe();
    await fetch(unsubscribeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    setStatus("unsubscribed");
    setState(false);
    await showLocalNotification(goodbyeTitle, goodbyeBody, iconUrl);
  }

  async function refresh() {
    if (!("serviceWorker" in navigator)) {
      setState(false);
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;
    setState(!!subscription);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    const enabled = button.dataset.enabled === "true";
    const action = enabled ? unsubscribe : subscribe;
    action().catch((err) => {
      console.error(err);
      setStatus(enabled ? "unsubscribe failed" : "subscribe failed");
    });
  });

  button.refresh = refresh;
  refresh().catch(() => setState(false));
  return button;
}
