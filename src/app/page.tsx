"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Sistema from "@/sistema/Sistema";

// Fluxo de acesso: e-mail e senha → código do app autenticador (2ª etapa) → sistema.
// Na primeira vez, cadastra o app autenticador lendo o QR code.
type Etapa = "carregando" | "login" | "cadastrar2fa" | "verificar2fa" | "pronto";

export default function Pagina() {
  const [etapa, setEtapa] = useState<Etapa>("carregando");

  const avaliar = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return setEtapa("login");
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") return setEtapa("pronto");
    const { data: f } = await supabase.auth.mfa.listFactors();
    setEtapa(f?.totp?.length ? "verificar2fa" : "cadastrar2fa");
  }, []);

  useEffect(() => {
    // INITIAL_SESSION chega logo ao assinar. A avaliação roda fora do callback,
    // porque chamar o Supabase dentro dele pode travar a sessão.
    const { data } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_OUT") setEtapa("login");
      else if (ev === "INITIAL_SESSION") setTimeout(avaliar, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [avaliar]);

  if (etapa === "pronto") return <Sistema />;
  return (
    <>
      <div className="bg" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <main className="auth">
        {etapa === "carregando" && <div className="panel"><span className="muted">Carregando…</span></div>}
        {etapa === "login" && <Login onOk={avaliar} />}
        {etapa === "cadastrar2fa" && <Cadastrar2fa onOk={avaliar} />}
        {etapa === "verificar2fa" && <Verificar2fa onOk={avaliar} />}
      </main>
    </>
  );
}

function Marca() {
  return <div className="brand" style={{ padding: 0 }}><span className="mark">B</span><div><b>Finanças do Bruno</b></div></div>;
}

function Login({ onOk }: { onOk: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setErro("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setOcupado(false);
    if (error) return setErro("E-mail ou senha incorretos.");
    onOk();
  }
  return (
    <form className="panel" onSubmit={entrar}>
      <Marca />
      <h1>Entrar</h1>
      <div className="field"><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><label htmlFor="senha">Senha</label><input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
      {erro && <span className="err">{erro}</span>}
      <button className="btn primary" type="submit" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
      <span className="muted small">Depois da senha, o sistema pede o código do seu app autenticador.</span>
    </form>
  );
}

function CampoCodigo({ valor, mudar }: { valor: string; mudar: (v: string) => void }) {
  return (
    <div className="field"><label htmlFor="codigo">Código de 6 dígitos</label>
      <input id="codigo" className="code-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
        value={valor} onChange={(e) => mudar(e.target.value.replace(/\D/g, ""))} required /></div>
  );
}

function Verificar2fa({ onOk }: { onOk: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  async function verificar(e: React.FormEvent) {
    e.preventDefault(); setErro("");
    const { data: f } = await supabase.auth.mfa.listFactors();
    const fator = f?.totp?.[0];
    if (!fator) return onOk();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (error) { setCodigo(""); return setErro("Código inválido ou vencido. Use o código que está aparecendo agora no app."); }
    onOk();
  }
  return (
    <form className="panel" onSubmit={verificar}>
      <Marca />
      <h1>Verificação em duas etapas</h1>
      <span className="muted">Abra o app autenticador no celular e digite o código de &quot;Finanças do Bruno&quot;.</span>
      <CampoCodigo valor={codigo} mudar={setCodigo} />
      {erro && <span className="err">{erro}</span>}
      <button className="btn primary" type="submit" disabled={codigo.length !== 6}>Confirmar</button>
      <button className="linkbtn" type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
    </form>
  );
}

function Cadastrar2fa({ onOk }: { onOk: () => void }) {
  const [fator, setFator] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    (async () => {
      // Remove cadastros antigos que não foram concluídos, para não acumular.
      const { data: f } = await supabase.auth.mfa.listFactors();
      for (const x of f?.all ?? []) if (x.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Finanças do Bruno" });
      if (error || !data) return setErro("Não foi possível iniciar o cadastro: " + (error?.message ?? ""));
      setFator({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    })();
  }, []);
  async function confirmar(e: React.FormEvent) {
    e.preventDefault(); setErro("");
    if (!fator) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (error) { setCodigo(""); return setErro("Código inválido. Confira se leu o QR code certo e tente com o código atual."); }
    onOk();
  }
  return (
    <form className="panel" onSubmit={confirmar}>
      <Marca />
      <h1>Ative a verificação em duas etapas</h1>
      <ol className="steps">
        <li><span>No celular, abra um app autenticador (Google Authenticator, Microsoft Authenticator ou o do seu gerenciador de senhas).</span></li>
        <li><span>Escolha adicionar conta e leia o QR code abaixo.</span></li>
        <li><span>Digite o código de 6 dígitos que aparecer.</span></li>
      </ol>
      {fator ? (
        <div className="qr">
          {/* QR code em data URL gerado pelo Supabase: não passa pelo otimizador de imagens. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fator.qr} alt="QR code para o app autenticador" />
        </div>
      ) : <span className="muted">Gerando QR code…</span>}
      {fator && <span className="muted small">Sem câmera? Digite esta chave no app: <code>{fator.segredo}</code></span>}
      <CampoCodigo valor={codigo} mudar={setCodigo} />
      {erro && <span className="err">{erro}</span>}
      <button className="btn primary" type="submit" disabled={!fator || codigo.length !== 6}>Ativar e entrar</button>
      <button className="linkbtn" type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
    </form>
  );
}
