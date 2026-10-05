import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");

    return savedUser
      ? JSON.parse(savedUser)
      : null;
  });

  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        password,
      });

      const {
        access_token,
        user,
      } = response.data;

      localStorage.setItem(
        "access_token",
        access_token
      );

      localStorage.setItem(
        "user",
        JSON.stringify(user)
      );

      setUser(user);

      return {
        success: true,
        user,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error.response?.data?.detail ||
          "Login failed",
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
          name,
          email,
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
        message:
          error.response?.data?.detail ||
          "Registration failed",
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");

    setUser(null);
  };

  // Same object between renders -> pages that only read `user`
  // are not re-rendered every time something else changes.
  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
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