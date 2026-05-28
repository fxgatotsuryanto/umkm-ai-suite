const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

async function call<T = unknown>(
  path: string,
  options: RequestInit & { params?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { params, ...init } = options;
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as Record<string, string>).detail ?? (err as Record<string, string>).error ?? `HTTP ${res.status}`);
  }
  return res.json() as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Balance = {
  balance: number;
  package: string;
  expires_at: string | null;
};

export type Chat = {
  id: number;
  wa_number: string;
  customer_name: string;
  message_in: string;
  message_out: string;
  tokens_used: number;
  created_at: string;
};

export type Content = {
  id: number;
  platform: string;
  content_type: string;
  title: string;
  content: string;
  hashtags: string;
  cta: string;
  tokens_used: number;
  created_at: string;
};

export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  is_active: boolean;
  created_at: string;
};

export type FAQ = {
  id: number;
  question: string;
  answer: string;
  category: string;
  created_at: string;
};

export type Profile = {
  name?: string;
  type?: string;
  phone?: string;
  description?: string;
  address?: string;
  wa_greeting?: string;
};

export type WebChatLead = {
  session_id: string;
  visitor_name: string;
  visitor_wa: string;
  visitor_email: string;
  kebutuhan: string;
  solusi: string;
  lead_captured: boolean;
  created_at: string;
  last_active: string;
};

export type WebChatMsg = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type WebChatConfig = {
  agent_name: string;
  greeting: string;
  theme_color: string;
  system_prompt_extra: string;
  cta_wa_number: string;
  telegram_chat_id: string;
  webhook_url: string;
  auto_open: boolean;
  updated_at: string;
};

export type Stats = {
  today: {
    wa_chats: number;
    webchat_sessions: number;
    webchat_leads: number;
    content_generated: number;
    tokens_used: number;
  };
  week: { tokens_used: number };
  total: {
    wa_chats: number;
    webchat_sessions: number;
    webchat_leads: number;
    content_generated: number;
  };
};

// ── API Client ────────────────────────────────────────────────────────────────

export const api = {
  // Token
  getBalance: () => call<Balance>('/api/token/balance'),

  // Stats
  getStats: () => call<Stats>('/api/stats'),

  // Profile
  getProfile: () => call<Profile | { message: string; profile: null }>('/api/profile'),
  updateProfile: (data: Partial<Profile>) =>
    call('/api/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // WA Chats
  getChats: (limit = 50) => call<Chat[]>('/api/wa/chats', { params: { limit } }),

  // Content
  generateContent: (data: {
    platform: string;
    content_type: string;
    topic?: string;
    product_id?: number;
  }) =>
    call<{
      success: boolean;
      id?: number;
      platform?: string;
      content_type?: string;
      title?: string;
      content?: string;
      hashtags?: string;
      cta?: string;
      tokens_used?: number;
      error?: string;
    }>('/api/content/generate', { method: 'POST', body: JSON.stringify(data) }),
  getContentLibrary: (params?: { platform?: string; limit?: number }) =>
    call<Content[]>('/api/content/library', { params }),

  // Products
  getProducts: () => call<Product[]>('/api/products'),
  createProduct: (data: {
    name: string;
    price: number;
    stock?: number;
    description?: string;
    category?: string;
  }) => call('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  deleteProduct: (id: number) => call(`/api/products/${id}`, { method: 'DELETE' }),

  // FAQs
  getFAQs: () => call<FAQ[]>('/api/faqs'),
  createFAQ: (data: { question: string; answer: string; category?: string }) =>
    call('/api/faqs', { method: 'POST', body: JSON.stringify(data) }),
  deleteFAQ: (id: number) => call(`/api/faqs/${id}`, { method: 'DELETE' }),

  // WebChat
  getWebChatLeads: (params?: { captured_only?: boolean; limit?: number }) =>
    call<WebChatLead[]>('/api/webchat/leads', { params }),
  getWebChatHistory: (sessionId: string, limit = 100) =>
    call<WebChatMsg[]>(`/api/webchat/history/${sessionId}`, { params: { limit } }),
  getWebChatConfig: () => call<WebChatConfig>('/api/webchat/config'),
  updateWebChatConfig: (data: Partial<WebChatConfig>) =>
    call('/api/webchat/config', { method: 'PUT', body: JSON.stringify(data) }),
  getWebChatWidgetConfig: () =>
    call<{ business_name: string; agent_name: string; greeting: string; theme_color: string; auto_open: boolean; cta_wa_number: string }>(
      '/api/webchat/widget-config',
    ),
  exportLeadsUrl: () => `${BASE_URL}/api/webchat/leads/export`,
};

export const BACKEND_URL = BASE_URL;
