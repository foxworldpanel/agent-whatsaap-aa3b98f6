/**
 * Agent Mind V2 - Ferramenta de Consulta de Serviços Enxuta
 */

export type QueryLevel = 'summary' | 'detail' | 'calculation' | 'purchase';

export interface ConsultarServicosV2Input {
  workspaceId: string;
  network: string;
  service?: string;
  queryLevel: QueryLevel;
  quantity?: number;
}

export interface ServicePublicInfo {
  serviceId: string;
  serviceName: string;
  network: string;
  category: string;
  shortDescription?: string;
  salePrice: number;
  minimum?: number;
  maximum?: number;
  duration?: string;
  speed?: string;
  guarantee?: string;
  linkType: 'track' | 'artist_profile' | 'profile' | 'post' | 'unknown';
  isActive: boolean;
  source: 'catalog' | 'manual';
  updatedAt: string;
}

// Fixtures para Teste
const FIXTURES: Record<string, ServicePublicInfo[]> = {
  spotify: [
    {
      serviceId: 'spot-playlist-1',
      serviceName: 'Aluguel de Playlist',
      network: 'spotify',
      category: 'playlist',
      shortDescription: 'Divulgação em playlists orgânicas.',
      salePrice: 49.90,
      minimum: 1,
      maximum: 10,
      linkType: 'track',
      isActive: true,
      source: 'manual',
      updatedAt: new Date().toISOString()
    },
    {
      serviceId: 'spot-followers-1',
      serviceName: 'Seguidores para Perfil',
      network: 'spotify',
      category: 'followers',
      shortDescription: 'Aumento de seguidores no perfil do artista.',
      salePrice: 15.00, // Preço por 1000 ex.
      minimum: 50,
      maximum: 100000,
      linkType: 'artist_profile',
      isActive: true,
      source: 'catalog',
      updatedAt: new Date().toISOString()
    },
    {
      serviceId: 'spot-plays-1',
      serviceName: 'Reproduções (Plays)',
      network: 'spotify',
      category: 'plays',
      salePrice: 20.00,
      isActive: false, // Inativo para teste
      linkType: 'track',
      source: 'catalog',
      updatedAt: new Date().toISOString()
    }
  ]
};

/**
 * Função pura de consulta simulada para o commit atual.
 * Futuramente buscará de catalog_cache ou commercial_services.
 */
export async function consultarServicosV2(input: ConsultarServicosV2Input): Promise<any> {
  const { network, service, queryLevel, quantity } = input;
  
  const networkFixtures = FIXTURES[network.toLowerCase()];
  if (!networkFixtures) {
    return { error: 'Rede não encontrada ou sem serviços configurados.' };
  }

  // Filtrar pelo serviço se especificado
  let services = networkFixtures;
  if (service) {
    const serviceLower = service.toLowerCase();
    services = networkFixtures.filter(s => 
      s.category.toLowerCase().includes(serviceLower) || 
      s.serviceName.toLowerCase().includes(serviceLower)
    );
  }

  // Se o serviço solicitado está inativo, retornar erro e alternativas ativas
  const requestedService = services[0];
  if (service && requestedService && !requestedService.isActive) {
    const alternatives = networkFixtures.filter(s => s.isActive);
    return { 
      error: `O serviço '${service}' está temporariamente indisponível.`,
      alternatives: alternatives.map(s => renderByLevel(s, 'summary'))
    };
  }

  switch (queryLevel) {
    case 'summary':
      return services.filter(s => s.isActive).map(s => renderByLevel(s, 'summary'));
    
    case 'detail':
      return services.length > 0 ? renderByLevel(services[0], 'detail') : { error: 'Serviço não encontrado.' };
    
    case 'calculation':
      if (!quantity || !services[0]) return { error: 'Quantidade ou serviço não informado para cálculo.' };
      const s = services[0];
      const totalPrice = (s.salePrice * quantity) / (s.category === 'followers' ? 1000 : 1);
      return {
        ...renderByLevel(s, 'calculation'),
        totalPrice: Number(totalPrice.toFixed(2)),
        requestedQuantity: quantity,
        isQuantityValid: quantity >= (s.minimum || 0) && quantity <= (s.maximum || Infinity)
      };
    
    case 'purchase':
      return services.length > 0 ? renderByLevel(services[0], 'purchase') : { error: 'Serviço não encontrado.' };
    
    default:
      return services.map(s => renderByLevel(s, 'summary'));
  }
}

function renderByLevel(service: ServicePublicInfo, level: QueryLevel): Partial<ServicePublicInfo> {
  const { serviceId, serviceName, network, category, shortDescription, salePrice, minimum, maximum, duration, speed, guarantee, linkType, isActive, updatedAt } = service;
  
  switch (level) {
    case 'summary':
      return { serviceName, category, shortDescription, isActive };
    case 'detail':
      return { serviceName, category, shortDescription, salePrice, minimum, maximum, duration, speed, guarantee, linkType, isActive };
    case 'calculation':
      return { serviceName, salePrice, minimum, maximum, isActive };
    case 'purchase':
      return { serviceId, serviceName, salePrice, linkType, isActive, updatedAt };
    default:
      return { serviceName, category, isActive };
  }
}
