import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Painel do Bruno",
  description: "Finanças, investimentos e vida pessoal",
  robots: { index: false, follow: false },
};

// Aplica o tema escolhido antes de desenhar a página, para não piscar.
const TEMA = `try{var t=localStorage.getItem("tema");if(t==="claro")document.documentElement.dataset.theme="light";else if(t==="escuro")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
