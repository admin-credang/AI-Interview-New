import { resolveApiBaseUrl } from "./resolveApiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.PROD,
  import.meta.env.VITE_API_BASE_URL,
  window.location.origin,
);

export default API_BASE_URL;
