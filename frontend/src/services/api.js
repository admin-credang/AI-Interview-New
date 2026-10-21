
import axios from "axios";

// API BASE URL
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? "/api"
    : "http://127.0.0.1:8000")
).replace(/\/+$/, "");

// AXIOS INSTANCE
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// REQUEST INTERCEPTOR
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem("access_token");

      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }

      if (import.meta.env.DEV) {
        console.debug(
          "API REQUEST:",
          config.method?.toUpperCase(),
          `${config.baseURL || ""}${config.url || ""}`
        );
      }
    } catch (error) {
      console.error("Request interceptor error:", error);
    }

    return config;
  },
  (error) => {
    console.error("Request configuration error:", error);
    return Promise.reject(error);
  }
);

// RESPONSE INTERCEPTOR
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.debug(
        "API RESPONSE:",
        response.status,
        response.config?.url
      );
    }

    return response;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      console.error("API ERROR:", status, data);
    } else {
      console.error("API CONNECTION ERROR:", error.message);
      console.error("API BASE URL:", API_BASE_URL);
      console.error("REQUEST URL:", error.config?.url);
    }

    return Promise.reject(error);
  }
);

export default api;
