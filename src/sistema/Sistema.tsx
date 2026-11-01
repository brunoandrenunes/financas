"use client";
import { useEffect, useRef } from "react";
import { api } from "./dados";
import { iniciar } from "./motor";

// O motor desenha as telas dentro de #raiz (mesmo visual do protótipo aprovado).
export default function Sistema() {
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    iniciar(document.getElementById("raiz"), api);
  }, []);
  return <div id="raiz" />;
}
