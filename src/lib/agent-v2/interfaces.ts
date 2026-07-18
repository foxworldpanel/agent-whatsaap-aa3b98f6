/**
 * Agent Mind V2 - Contratos e Interfaces
 */

import { ServiceSummary, ServiceDetail, PriceCalculation } from './types';

/**
 * Nova interface enxuta para consulta de serviços (V2)
 * Substitui o fetchServicesContext pesado por chamadas granulares.
 */
export interface IServiceQuerier {
  /**
   * Retorna um resumo dos serviços ativos agrupados por rede.
   * Usado para navegação inicial sem injetar o catálogo todo.
   */
  listActiveServicesSummary(network?: string): Promise<ServiceSummary[]>;

  /**
   * Busca detalhes de um serviço específico.
   * Injetado apenas quando o modelo decide focar em um serviço.
   */
  getServiceDetail(serviceId: string): Promise<ServiceDetail | null>;

  /**
   * Calcula o preço final para uma quantidade.
   */
  calculatePrice(serviceId: string, quantity: number): Promise<PriceCalculation>;
}

/**
 * Interface principal do Cérebro V2
 */
export interface IAgentBrainV2 {
  /**
   * Processa uma mensagem recebida e retorna a resposta da V2.
   */
  process(message: string, conversationId: string): Promise<{
    response: string;
    metrics: any;
    state: any;
  }>;
}
