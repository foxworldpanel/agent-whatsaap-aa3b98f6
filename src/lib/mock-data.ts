export type ContactProfile = "ativo" | "frio" | "inativo";
export type ContactStatus = "nao_abordado" | "em_conversa" | "convertido" | "sem_resposta" | "bloqueado";

export interface Contact {
  id: string;
  nome: string;
  telefone: string;
  perfil: ContactProfile;
  status: ContactStatus;
  ultimaInteracao?: string;
}

export const profileLabel: Record<ContactProfile, string> = {
  ativo: "Cliente Ativo",
  frio: "Lead Frio",
  inativo: "Cliente Inativo",
};

export const statusLabel: Record<ContactStatus, string> = {
  nao_abordado: "Não abordado",
  em_conversa: "Em conversa",
  convertido: "Convertido",
  sem_resposta: "Sem resposta",
  bloqueado: "Bloqueado",
};

export const mockContacts: Contact[] = [
  { id: "1", nome: "Lucas Silva", telefone: "+55 11 99876-1234", perfil: "frio", status: "em_conversa", ultimaInteracao: "há 5 min" },
  { id: "2", nome: "Mariana Costa", telefone: "+55 21 98765-4321", perfil: "ativo", status: "convertido", ultimaInteracao: "há 1h" },
  { id: "3", nome: "Pedro Almeida", telefone: "+55 31 91234-5678", perfil: "inativo", status: "sem_resposta", ultimaInteracao: "ontem" },
  { id: "4", nome: "Juliana Rocha", telefone: "+55 11 99999-0000", perfil: "frio", status: "nao_abordado" },
  { id: "5", nome: "Rafael Mendes", telefone: "+55 47 98888-1111", perfil: "ativo", status: "em_conversa", ultimaInteracao: "há 12 min" },
  { id: "6", nome: "Camila Souza", telefone: "+55 85 97777-2222", perfil: "inativo", status: "convertido", ultimaInteracao: "há 2 dias" },
  { id: "7", nome: "Bruno Lima", telefone: "+55 51 96666-3333", perfil: "frio", status: "sem_resposta", ultimaInteracao: "há 3h" },
  { id: "8", nome: "Fernanda Dias", telefone: "+55 71 95555-4444", perfil: "ativo", status: "em_conversa", ultimaInteracao: "agora" },
];

export interface Conversation {
  id: string;
  contactId: string;
  nome: string;
  perfil: ContactProfile;
  status: "agente_respondendo" | "aguardando" | "convertido";
  ultimaMensagem: string;
  horario: string;
  mensagens: Array<{ de: "agente" | "cliente"; texto: string; hora: string; tipo?: "texto" | "audio" }>;
}

export const mockConversations: Conversation[] = [
  {
    id: "c1",
    contactId: "1",
    nome: "Lucas Silva",
    perfil: "frio",
    status: "agente_respondendo",
    ultimaMensagem: "Show! 500 views por R$5 mesmo?",
    horario: "14:32",
    mensagens: [
      { de: "agente", texto: "Oi Lucas! Tudo bem? 😊", hora: "14:25" },
      { de: "cliente", texto: "Oi, tudo sim. Quem é?", hora: "14:27" },
      { de: "agente", texto: "Tô vendo aqui que você posta no YouTube. Curto demais o seu conteúdo 🎬", hora: "14:28" },
      { de: "cliente", texto: "Valeu! Tá meio parado mas tô tentando", hora: "14:30" },
      { de: "agente", texto: "Tenho uma promo testando agora — 500 views por R$5 só pra dar aquele empurrão. Quer testar?", hora: "14:31" },
      { de: "cliente", texto: "Show! 500 views por R$5 mesmo?", hora: "14:32" },
    ],
  },
  {
    id: "c2",
    contactId: "5",
    nome: "Rafael Mendes",
    perfil: "ativo",
    status: "aguardando",
    ultimaMensagem: "Vou pensar e te aviso",
    horario: "14:20",
    mensagens: [
      { de: "agente", texto: "Oi Rafael! Suas views foram entregues certinho? 😊", hora: "14:10" },
      { de: "cliente", texto: "Sim, chegou tudo. Obrigado!", hora: "14:15" },
      { de: "agente", texto: "Que bom! Tenho um pacote de 2.000 views por R$18 pra turbinar mais. Quer?", hora: "14:17" },
      { de: "cliente", texto: "Vou pensar e te aviso", hora: "14:20" },
    ],
  },
  {
    id: "c3",
    contactId: "2",
    nome: "Mariana Costa",
    perfil: "ativo",
    status: "convertido",
    ultimaMensagem: "Pagamento feito! 🎉",
    horario: "13:05",
    mensagens: [
      { de: "agente", texto: "Oi Mariana! Tudo bem? 😊", hora: "12:50" },
      { de: "cliente", texto: "Tudo! Quero comprar mais views", hora: "12:55" },
      { de: "agente", texto: "Maravilha! Aqui o link do painel: smm.exemplo.com/painel", hora: "12:58" },
      { de: "cliente", texto: "Pagamento feito! 🎉", hora: "13:05" },
    ],
  },
];

export interface CampaignLog {
  id: string;
  hora: string;
  contato: string;
  mensagem: string;
  status: "enviado" | "respondido" | "falha";
}

export const mockLogs: CampaignLog[] = [
  { id: "l1", hora: "14:32", contato: "Lucas Silva", mensagem: "Tenho uma promo testando agora...", status: "respondido" },
  { id: "l2", hora: "14:29", contato: "Juliana Rocha", mensagem: "Oi Juliana! Tudo bem? 😊", status: "enviado" },
  { id: "l3", hora: "14:26", contato: "Bruno Lima", mensagem: "Oi Bruno! Tudo bem? 😊", status: "enviado" },
  { id: "l4", hora: "14:23", contato: "Pedro Almeida", mensagem: "Oi Pedro! Sumiu hein 😄", status: "falha" },
  { id: "l5", hora: "14:20", contato: "Rafael Mendes", mensagem: "Tenho um pacote de 2.000 views...", status: "respondido" },
];