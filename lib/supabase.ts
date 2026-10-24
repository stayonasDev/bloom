import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// RLS 없음·로그인 없음 (참고_문서 §1-1). DB 접근은 이 service role 클라이언트로만 하고,
// 이 모듈은 server-only라 클라이언트 번들에 들어갈 수 없다.

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required (server-only)");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
