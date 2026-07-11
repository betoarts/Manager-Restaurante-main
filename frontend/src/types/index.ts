export interface Empresa {
  id: number;
  nome: string;
  cnpj: string;
  telefone: string;
  logo_url: string;
  theme: string; // JSON string for MUI config
  created_at: string;
  updated_at: string;
}

export type Role = 'admin' | 'gerente' | 'caixa' | 'cozinha' | 'garcom' | 'entregador';

export interface Usuario {
  id: number;
  tenant_id: number;
  nome: string;
  email: string;
  role: 'admin' | 'caixa' | 'garcom' | 'cozinha' | 'entregador';
  created_at: string;
  updated_at: string;
}

export interface Mesa {
  id: number;
  tenant_id: number;
  numero: number;
  status: 'livre' | 'ocupada' | 'reservada' | 'em_fechamento';
  capacidade: number;
  pos_x: number;
  pos_y: number;
  created_at: string;
  updated_at: string;
}

export interface Setor {
  id: number;
  tenant_id: number;
  nome: string;
  created_at: string;
  updated_at: string;
}

export interface Categoria {
  id: number;
  tenant_id: number;
  nome: string;
  descricao: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoria {
  nome: string;
  descricao?: string;
}

export interface CreateProduto {
  categoria_id: number;
  nome: string;
  descricao?: string;
  preco: number;
  codigo_barras?: string;
  imagem_url?: string;
  setor_id?: number;
  tipo?: 'produto' | 'insumo';
  unidade_medida?: 'un' | 'kg' | 'g' | 'l' | 'ml';
}

export interface Produto {
  id: number;
  tenant_id: number;
  categoria_id: number;
  nome: string;
  descricao: string;
  preco: number;
  codigo_barras: string;
  imagem_url: string;
  ativo: boolean;
  setor_id: number;
  tipo: 'produto' | 'insumo';
  unidade_medida: 'un' | 'kg' | 'g' | 'l' | 'ml';
  created_at: string;
  updated_at: string;
}

export interface ItemPedido {
  id?: number;
  tenant_id?: number;
  pedido_id?: number;
  produto_id: number;
  produto_nome: string;
  quantidade: number;
  observacao: string;
  preco_unitario: number;
  status: 'recebido' | 'produzindo' | 'pronto' | 'despachado' | 'entregue';
  impresso?: boolean;
  setor_id: number;
  created_at?: string;
}

export interface Pedido {
  id: number;
  tenant_id: number;
  comanda_id?: number;
  mesa_id?: number;
  status: 'recebido' | 'produzindo' | 'pronto' | 'despachado' | 'entregue';
  origem: 'mesa' | 'delivery' | 'balcao';
  total: number;
  cliente_id?: number;
  entregador_id?: number;
  endereco_entrega?: string;
  cpf_cnpj_cliente?: string;
  chave_acesso_nfe?: string;
  url_cupom_fiscal?: string;
  itens: ItemPedido[];
  created_at: string;
  updated_at: string;
}

export interface CaixaTurno {
  id: number;
  tenant_id: number;
  usuario_id: number;
  status: 'aberto' | 'fechado';
  valor_inicial: number;
  valor_final: number;
  aberto_em: string;
  fechado_em?: string;
}

export interface CaixaMovimentacao {
  id: number;
  tenant_id: number;
  caixa_turno_id: number;
  tipo: 'sangria' | 'suprimento';
  valor: number;
  motivo: string;
  created_at: string;
}

export interface Pagamento {
  id: number;
  tenant_id: number;
  pedido_id?: number;
  comanda_id?: number;
  metodo: 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro';
  valor: number;
  status: 'pendente' | 'aprovado' | 'recusado' | 'estornado';
  transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Impressora {
  id: number;
  tenant_id: number;
  nome: string;
  tipo: 'tcp' | 'usb';
  ip: string;
  porta: number;
  dispositivo: string;
  setor_id: number;
  created_at: string;
  updated_at: string;
}

export interface Pinpad {
  id: number;
  tenant_id: number;
  nome: string;
  modelo: string;
  tipo: 'serial' | 'tcp';
  ip: string;
  porta: number;
  dispositivo: string;
  serial: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PinpadStatus {
  online: boolean;
  modelo: string;
  serial: string;
  firmware?: string;
  last_check: string;
  error?: string;
  battery_level?: number;
}

export interface TEFPaymentResult {
  success: boolean;
  authorization_code?: string;
  transaction_id?: string;
  message?: string;
  simulated?: boolean;
}

export interface Estoque {
  id: number;
  tenant_id: number;
  produto_id: number;
  produto_nome: string;
  quantidade: number;
  minimo: number;
  alerta: boolean;
  preco_unitario: number;
  produto_tipo: 'produto' | 'insumo';
  unidade_medida: 'un' | 'kg' | 'g' | 'l' | 'ml';
}

export interface FichaTecnicaItem {
  id: number;
  tenant_id: number;
  produto_id: number;
  insumo_id: number;
  quantidade: number;
  created_at: string;
  updated_at: string;
  updated_at: string;
  insumo?: Produto;
}

export interface Fornecedor {
  id: number;
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  ativo: boolean;
}

export interface CompraItem {
  id?: number;
  produto_id: number;
  quantidade: number;
  custo_unitario: number;
  subtotal: number;
  produto?: Produto;
}

export interface Compra {
  id: number;
  fornecedor_id: number;
  numero_nf: string;
  data_compra: string;
  valor_total: number;
  status: string;
  itens: CompraItem[];
  fornecedor?: Fornecedor;
  created_at: string;
}

export interface ContaPagar {
  id: number;
  fornecedor_id?: number;
  compra_id?: number;
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: 'pendente' | 'paga' | 'cancelada';
  fornecedor?: Fornecedor;
  created_at: string;
}

export interface LancamentoFinanceiro {
  id: number;
  tenant_id: number;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  caixa_turno_id?: number;
  conta_pagar_id?: number;
  created_at: string;
  updated_at: string;
}

