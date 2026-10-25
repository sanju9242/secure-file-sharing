import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'),
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  if (
    error.response?.status === 401
    && error.response.data?.error === 'Session expired. Please log in again.'
    && error.config?.headers?.Authorization
  ) {
    await supabase.auth.signOut({ scope: 'local' });
  }
  return Promise.reject(error);
});

export default api;
