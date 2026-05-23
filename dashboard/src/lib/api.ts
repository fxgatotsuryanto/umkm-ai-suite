const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

async function call<T = unknown>(path: string, options: RequestInit & { params?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const { params, ...init } = options;
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
      )
    ).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? (err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as T;
}

export type Balance = { balance: number; package: string; expires_at: string | null };
export type Chat = { id: number; wa_number: string; customer_name: string; message_in: string; message_out: string; tokens_used: number; created_at: string };
export type Content = { id: number; platform: string; content_type: string; title: string; content: string; hashtags: string; cta: string; tokens_used: number; created_at: string };
export type Product = { id: number; name: string; description: string; price: number; stock: number; category: string; is_active: boolean; created_at: string };
export type FAQ = { id: number; question: string; answer: string; category: string; created_at: string };
export type Profile = { name?: string; type?: string; phone?: string; description?: string; address?: string; wa_greeting?: string };

export const api = {
  getBalance: () => call<Balance>('/api/token/balance'),

  getProfile: () => call<Profile | { message: string; profile: null }>('/api/profile'),
  updateProfile: (data: Partial<Profile>) => call('/api/profile', { method: 'PUT', body: JSON.stringify(data) }),

  getChats: (limit = 50) => call<Chat[]>(`/api/wa/chats?limit=${limit}`),

  generateContent: (data: { platform: string; content_type: string; topic?: string; product_id?: number }) =>
    call<{ success: boolean; id?: number; platform?: string; content_type?: string; title?: string; content?: string; hashtags?: string; cta?: string; tokens_used?: number; error?: string }>('/api/content/generate', { method: 'POST', body: JSON.stringify(data) }),

  getContentLibrary: (params?: { platform?: string; limit?: number }) =>
    call<Content[]>('/api/content/library', { params }),

  getProducts: () => call<Product[]>('/api/products'),
  createProduct: (data: { name: string; price: number; stock?: number; description?: string; category?: string }) =>
    call('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  deleteProduct: (id: number) =>
    call(`/api/products/${id}`, { method: 'DELETE' }),

  getFAQs: () => call<FAQ[]>('/api/faqs'),
  createFAQ: (data: { question: string; answer: string; category?: string }) =>
    call('/api/faqs', { method: 'POST', body: JSON.stringify(data) }),
  deleteFAQ: (id: number) =>
    call(`/api/faqs/${id}`, { method: 'DELETE' }),
};
