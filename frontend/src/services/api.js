import axios from "axios";

// =========================================================
// API BASE URL
// =========================================================

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";

// =========================================================
// AXIOS INSTANCE
// =========================================================

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// =========================================================
// REQUEST INTERCEPTOR
// =========================================================

api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem("access_token");

      if (token) {
        config.headers = config.headers || {};

        config.headers.Authorization = `Bearer ${token}`;
      }

      // Debug (development only - logging on every request slows pages)
      if (import.meta.env.DEV) {
        console.debug(
          "API REQUEST:",
          config.method?.toUpperCase(),
          `${config.baseURL || ""}${config.url}`
        );
      }
    } catch (error) {
      console.error(
        "❌ Request interceptor error:",
        error
      );
    }

    return config;
  },
  (error) => {
    console.error(
      "❌ Request configuration error:",
      error
    );

    return Promise.reject(error);
  }
);

// =========================================================
// RESPONSE INTERCEPTOR
// =========================================================

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
    // -----------------------------------------------------
    // Backend responded with an error
    // -----------------------------------------------------

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      console.error(
        "❌ API ERROR:",
        status,
        data
      );

      // ---------------------------------------------------
      // 401 UNAUTHORIZED
      // ---------------------------------------------------

      if (status === 401) {
        console.warn(
          "🔐 Authentication required. Access token may be missing or expired."
        );

        const currentToken =
          localStorage.getItem("access_token");

        if (!currentToken) {
          console.warn(
            "⚠️ No access_token found in localStorage."
          );
        } else {
          console.warn(
            "⚠️ access_token exists, but backend rejected it."
          );
        }

        // IMPORTANT:
        // Do NOT automatically remove the token here.
        // Otherwise the application can unexpectedly log
        // the user out while other requests are running.
      }

      // ---------------------------------------------------
      // 403 FORBIDDEN
      // ---------------------------------------------------

      if (status === 403) {
        console.warn(
          "🚫 Access forbidden."
        );
      }

      // ---------------------------------------------------
      // 404 NOT FOUND
      // ---------------------------------------------------

      if (status === 404) {
        console.warn(
          "🔎 API endpoint not found:",
          error.config?.url
        );
      }

      // ---------------------------------------------------
      // 422 VALIDATION ERROR
      // ---------------------------------------------------

      if (status === 422) {
        console.warn(
          "⚠️ Validation error:",
          data
        );
      }

      // ---------------------------------------------------
      // 500 SERVER ERROR
      // ---------------------------------------------------

      if (status >= 500) {
        console.error(
          "🔥 Backend server error:",
          data
        );
      }
    }

    // -----------------------------------------------------
    // Request sent but no response received
    // -----------------------------------------------------

    else if (error.request) {
      console.error(
        "❌ No response received from backend."
      );

      console.error(
        "Backend URL:",
        API_BASE_URL
      );
    }

    // -----------------------------------------------------
    // Axios/request setup error
    // -----------------------------------------------------

    else {
      console.error(
        "❌ Request Error:",
        error.message
      );
    }

    return Promise.reject(error);
  }
);

// =========================================================
// EXPORT
// =========================================================

export default api;