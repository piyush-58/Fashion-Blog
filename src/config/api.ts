import axios, { AxiosError } from "axios";

// Use deployed backend URL
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "https://fashion-blog-mern-1.onrender.com";

console.log("🌐 API Base URL:", API_BASE_URL);

export const API_ENDPOINTS = {
  // Auth
  SIGNUP: `${API_BASE_URL}/api/auth/signup`,
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  GET_USER: (userId: string) => `${API_BASE_URL}/api/auth/user/${userId}`,
  UPDATE_USER: (userId: string) => `${API_BASE_URL}/api/auth/user/${userId}`,

  // Chat
  SEND_MESSAGE: `${API_BASE_URL}/api/chat/`,
  GET_CHAT_HISTORY: `${API_BASE_URL}/api/chat/history`,
 DELETE_CHAT_HISTORY: `${API_BASE_URL}/api/chat/all`,
  // Wardrobe
  ADD_ITEM: `${API_BASE_URL}/api/wardrobe/`,
  GET_ITEMS: `${API_BASE_URL}/api/wardrobe/`,
  DELETE_ITEM: (itemId: string) => `${API_BASE_URL}/api/wardrobe/${itemId}`,

  // Outfit Suggestions
  GET_SUGGESTIONS: `${API_BASE_URL}/api/outfits/suggest`,
  GENERATE_OUTFITS: `${API_BASE_URL}/api/outfits/generate`,
  GET_OUTFITS_FOR_USER: (userId: string) => `${API_BASE_URL}/api/outfits/user/${userId}`,
  DELETE_OUTFIT: (outfitId: string) => `${API_BASE_URL}/api/outfits/${outfitId}`,

  // Saved Outfits
  SAVE_OUTFIT: `${API_BASE_URL}/api/saved/`,
  GET_SAVED_OUTFITS: (userId: string) => `${API_BASE_URL}/api/saved/user/${userId}`,
  DELETE_SAVED_OUTFIT: (savedOutfitId: string) => `${API_BASE_URL}/api/saved/${savedOutfitId}`,
  LIKE_SAVED_OUTFIT: (savedOutfitId: string) => `${API_BASE_URL}/api/saved/${savedOutfitId}/like`,

  // Community/Posts
  CREATE_POST: `${API_BASE_URL}/api/posts/`,
  GET_POSTS: `${API_BASE_URL}/api/posts/`,
  GET_USER_POSTS: (userId: string) => `${API_BASE_URL}/api/posts/user/${userId}`,
  LIKE_POST: (postId: string) => `${API_BASE_URL}/api/posts/${postId}/like`,
  SAVE_POST: (postId: string) => `${API_BASE_URL}/api/posts/${postId}/save`,
  GET_SAVED_POSTS: (userId: string) => `${API_BASE_URL}/api/posts/saved/user/${userId}`,
  ADD_COMMENT: (postId: string) => `${API_BASE_URL}/api/posts/${postId}/comment`,
  DELETE_POST: (postId: string) => `${API_BASE_URL}/api/posts/${postId}`,
  DELETE_COMMENT: (postId: string, commentId: string) => `${API_BASE_URL}/api/posts/${postId}/comment/${commentId}`,
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 second timeout for production
  withCredentials: true, // ✅ Allow cookies and credentials
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - Add authorization token
apiClient.interceptors.request.use((config) => {
  // Don't override Content-Type if data is FormData
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  const token = localStorage.getItem("token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log("✅ Authorization token added to request");
  }

  return config;
});

// Response interceptor - Handle errors
const handleUnauthorized = () => {
  console.warn("⚠️  Unauthorized - Redirecting to auth");
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  window.location.href = "/auth";
};

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      console.error("❌ 401 Unauthorized");
      handleUnauthorized();
    } else if (error.response?.status === 500) {
      console.error("❌ 500 Server Error:", error.message);
    } else if (error.message === "Network Error") {
      console.error("❌ Network Error - Check if backend is running");
    }
    return Promise.reject(error);
  }
);

export const apiCall = async (
  url: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE" | string; data?: any; params?: any; headers?: any } = {}
) => {
  try {
    console.log(`📡 ${options.method || "GET"} ${url}`);
    const response = await apiClient({
      url,
      method: options.method || "GET",
      data: options.data,
      params: options.params,
      headers: options.headers,
    });
    console.log("✅ API Response:", response.status);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        handleUnauthorized();
      }

      // ✅ Better error messages for debugging
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.response?.data?.reply ||
        error.message;

      console.error(`❌ API Error [${error.response?.status || "Network"}]:`, errorMessage);
      console.error("Error Details:", {
        url,
        status: error.response?.status,
        method: options.method,
        message: errorMessage,
      });

      throw new Error(errorMessage || "API Error");
    }
    throw error;
  }
};
