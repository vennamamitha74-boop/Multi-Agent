import { getAuthToken } from "./firebase";

/**
 * Multi-Agent Autonomous Platform API Client
 * Centralized, safe, and resilient client connecting to FastAPI backend.
 */

export const FALLBACK_BACKEND_URL = "https://multi-agent-backend-06ve.onrender.com";

export function getApiBaseUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    FALLBACK_BACKEND_URL;

  url = url.trim().replace(/\/+$/, "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number = 500, data: any = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Safely executes HTTP requests and parses JSON or text responses.
 * Prevents "Unexpected token 'I', Internal S... is not valid JSON" parsing crashes.
 */
async function safeFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${cleanPath}`;

  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    let parsedData: any = null;
    if (rawText && rawText.trim().length > 0) {
      if (contentType.includes("application/json") || rawText.trim().startsWith("{") || rawText.trim().startsWith("[")) {
        try {
          parsedData = JSON.parse(rawText);
        } catch {
          parsedData = rawText;
        }
      } else {
        parsedData = rawText;
      }
    }

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status} ${res.statusText || "Error"}`;
      if (parsedData && typeof parsedData === "object") {
        errorMessage = parsedData.detail || parsedData.message || parsedData.error || errorMessage;
      } else if (typeof parsedData === "string" && parsedData.length > 0 && parsedData.length < 300) {
        errorMessage = parsedData;
      }
      return { ok: false, status: res.status, data: errorMessage as any };
    }

    return { ok: true, status: res.status, data: parsedData as T };
  } catch (err: any) {
    console.error(`[API Network Error] ${url}:`, err);
    return {
      ok: false,
      status: 0,
      data: (err?.message || "Network connection to backend failed.") as any,
    };
  }
}

/**
 * Centralized API service methods
 */
export const api = {
  getHealth: async () => {
    return safeFetch("/health");
  },

  getReady: async () => {
    return safeFetch("/ready");
  },

  getTasks: async (userUid?: string) => {
    const token = await getAuthToken(userUid);
    return safeFetch("/api/tasks", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || "user_developer",
      },
    });
  },

  getTask: async (taskId: string, userUid?: string) => {
    const token = await getAuthToken(userUid);
    return safeFetch(`/api/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || "user_developer",
      },
    });
  },

  submitTask: async (payload: { request: string; user_id: string; document_ids?: string[] }, userUid?: string) => {
    const token = await getAuthToken(userUid);
    return safeFetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || payload.user_id,
      },
      body: JSON.stringify(payload),
    });
  },

  retryTask: async (taskId: string, userUid?: string) => {
    const token = await getAuthToken(userUid);
    return safeFetch(`/api/tasks/${taskId}/retry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || "user_developer",
      },
    });
  },

  getDocuments: async (userUid?: string) => {
    const token = await getAuthToken(userUid);
    return safeFetch("/api/documents", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || "user_developer",
      },
    });
  },

  uploadDocument: async (file: File, userUid?: string) => {
    const token = await getAuthToken(userUid);
    const formData = new FormData();
    formData.append("file", file);

    // Note: Do NOT set Content-Type header manually for FormData.
    // The browser will automatically attach multipart/form-data with the correct boundary.
    return safeFetch("/api/documents/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || "user_developer",
      },
      body: formData,
    });
  },

  deleteDocument: async (documentId: string, userUid?: string) => {
    const token = await getAuthToken(userUid);
    return safeFetch(`/api/documents/${documentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || "user_developer",
      },
    });
  },

  queryDocuments: async (
    payload: {
      query: string;
      document_id?: string | null;
      user_id?: string;
      top_k?: number;
      history?: Array<{ question: string; answer: string }>;
    },
    userUid?: string
  ) => {
    const token = await getAuthToken(userUid);
    return safeFetch("/api/documents/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-User-Id": userUid || payload.user_id || "user_developer",
      },
      body: JSON.stringify(payload),
    });
  },
};
