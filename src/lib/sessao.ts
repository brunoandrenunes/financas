import { supabase } from "./supabase";

// A sessão do Supabase fica guardada no navegador. Para que alguém que abra o
// computador depois não entre direto, o sistema sai sozinho após um período sem uso
// e, de qualquer forma, ao fim de um dia de uso.
const INATIVIDADE_MS = 2 * 60 * 60 * 1000; // 2 horas sem mexer
const DURACAO_MAX_MS = 12 * 60 * 60 * 1000; // 12 horas desde o login
const K_ATIV = "fin.ultimaAtividade";
const K_INICIO = "fin.inicioSessao";

const ler = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const gravar = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* sem armazenamento: vale só o limite do Supabase */ } };

export function marcarLogin() {
  const agora = Date.now();
  gravar(K_INICIO, agora);
  gravar(K_ATIV, agora);
}

export function sessaoVencida() {
  const agora = Date.now(), ativ = ler(K_ATIV), inicio = ler(K_INICIO);
  return !ativ || !inicio || agora - ativ > INATIVIDADE_MS || agora - inicio > DURACAO_MAX_MS;
}

// Registra atividade e confere o prazo a cada minuto. Devolve a função que desliga o vigia.
export function vigiarSessao() {
  let ultimaGravacao = 0;
  const atividade = () => { const agora = Date.now(); if (agora - ultimaGravacao > 30000) { ultimaGravacao = agora; gravar(K_ATIV, agora); } };
  const conferir = () => { if (sessaoVencida()) supabase.auth.signOut(); };
  const eventos = ["mousedown", "keydown", "wheel", "touchstart"] as const;
  eventos.forEach((e) => window.addEventListener(e, atividade, { passive: true }));
  document.addEventListener("visibilitychange", conferir);
  const t = setInterval(conferir, 60000);
  return () => {
    eventos.forEach((e) => window.removeEventListener(e, atividade));
    document.removeEventListener("visibilitychange", conferir);
    clearInterval(t);
  };
}
