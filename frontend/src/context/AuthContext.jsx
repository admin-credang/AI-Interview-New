import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import api from "../services/api";
import {
  clearStoredSession,
  getStoredUser,
  storeSession,
} from "../authStorage";

const AuthContext = createContext(null);

// Turns an axios error into a message the user can act on.
function loginErrorMessage(error) {
  const detail = error.response?.data?.detail;

  // FastAPI validation error (422) comes as a list
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg).join(", ") || "Check the e-mail and password.";
  }

  if (typeof detail === "string" && detail) return detail;

  if (!error.response) {
    return "Cannot reach the server. Start the backend (uvicorn app.main:app --reload) and check VITE_API_BASE_URL.";
  }

  return `Login failed (server error ${error.response.status}). Check the backend console.`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    return getStoredUser();
  });

  const [loading, setLoading] = useState(false);

  const login = async (email, password, remember = true) => {
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email: String(email || "").trim().toLowerCase(),
        password,
      });

      const {
        access_token,
        user,
      } = response.data;

      storeSession(access_token, user, remember);

      setUser(user);

      return {
        success: true,
        user,
      };
    } catch (error) {
      return {
        success: false,
        message: loginErrorMessage(error),
      };
    } finally {
      setLoading(false);
    }
  };

  // Google sign-in: `credential` is the ID token from Google Identity Services
  const googleLogin = async (credential, remember = true) => {
    setLoading(true);

    try {
      const response = await api.post("/auth/google", { credential });
      const { access_token, user } = response.data;

      storeSession(access_token, user, remember);
      setUser(user);

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        message:
          error.response?.data?.detail ||
          "Google sign-in failed. Please try again.",
      };
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    name,
    email,
    password,
    role
  ) => {
    setLoading(true);

    try {
      const response = await api.post(
        "/auth/register",
        {
          name: String(name || "").trim(),
          email: String(email || "").trim().toLowerCase(),
          password,
          role,
        }
      );

      return {
        success: true,
        user: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: loginErrorMessage(error),
      };
    } finally {
      setLoading(false);
    }
  };

  // Used by the e-mail invitation link: the server already signed the
  // candidate in, so just store the session (no password screen).
  const setSession = (access_token, sessionUser) => {
    storeSession(access_token, sessionUser);

    setUser(sessionUser);
  };

  const logout = () => {
    clearStoredSession();

    setUser(null);
  };

  // Same object between renders -> pages that only read `user`
  // are not re-rendered every time something else changes.
  const value = useMemo(
    () => ({ user, loading, login, googleLogin, register, logout, setSession }),
    // login / register / logout only use setters, so they are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}