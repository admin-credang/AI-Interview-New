const SESSION_KEYS = ["access_token", "user"];

export function getAccessToken() {
  try {
    return (
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token")
    );
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const savedUser = localStorage.getItem("access_token")
      ? localStorage.getItem("user")
      : sessionStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(accessToken, user, remember = true) {
  const destination = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;

  SESSION_KEYS.forEach((key) => {
    otherStorage.removeItem(key);
  });
  destination.setItem("access_token", accessToken);
  destination.setItem("user", JSON.stringify(user));
}

export function clearStoredSession() {
  SESSION_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}
