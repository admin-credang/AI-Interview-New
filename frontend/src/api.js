import axios from "axios";

const API_BASE_URL = import.meta.env.PROD
  ? "/api"
  : (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(
      /\/+$/,
      "",
    );

console.log("API BASE URL:", API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error("API Error:", error.response.status, error.response.data);

      if (error.response.status === 401) {
        console.warn("Authentication required.");
      }
    } else if (error.request) {
      console.error("No response received from backend.");
      console.error("Backend URL:", API_BASE_URL);
    } else {
      console.error("Request Error:", error.message);
    }

    return Promise.reject(error);
  },
);

export default api;
