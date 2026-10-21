// 자료 저장: Supabase (회의록 서랍 = minutes 표, 녹음 보관함 = recordings)
const sb = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey, {
  auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true }
});

const Data = {
  async currentUser() {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    return { id: u.id, email: u.email };
  },
  // 구글 계정으로 로그인 (허용된 계정 하나만 들어올 수 있음 — Supabase 문지기 규칙)
  async login() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } }
    });
    if (error) throw error;
  },
  async logout() { await sb.auth.signOut(); },

  async listMinutes() {
    const { data, error } = await sb.from("minutes")
      .select("id,title,created_at,status,mailed").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async getMinute(id) {
    const { data, error } = await sb.from("minutes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },

  // 녹음 → 보관함에 저장 → 회의록 서랍에 한 줄 추가
  // (글로 옮기기·회의록 만들기·메일은 서버 기능 연결 단계에서 붙습니다)
  async createFromAudio(file, title, onStep) {
    const user = await this.currentUser();
    if (!user) throw new Error("로그인이 필요해요");
    onStep("upload");
    const ext = (file.name.split(".").pop() || "audio").toLowerCase().replace(/[^a-z0-9]/g, "") || "audio";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const up = await sb.storage.from("recordings").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) throw up.error;
    const { data, error } = await sb.from("minutes")
      .insert({ title: title || file.name, audio_path: path, status: "processing" })
      .select().single();
    if (error) throw error;
    return data;
  }
};
