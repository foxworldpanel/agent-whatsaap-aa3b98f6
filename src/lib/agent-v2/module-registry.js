import { MISSION_V2 } from './core/mission';
import { IDENTITY_V2 } from './core/identity';
import { GUARDS_V2 } from './core/guards';
import { RECEPTIVE_V2 } from './core/receptive';
import { OUTBOUND_V2 } from './core/outbound';
import { COMMERCIAL_V2 } from './core/commercial';
import { SPOTIFY_OVERVIEW, SPOTIFY_PLAYLIST, SPOTIFY_FOLLOWERS, INSTAGRAM_V2, YOUTUBE_V2, TIKTOK_V2, FACEBOOK_V2, KWAI_V2, PANEL_V2, PAYMENTS_V2, TUTORIALS_V2, FREE_TEST_V2, SUPPORT_V2 } from './core/placeholders';
export const moduleRegistryV2 = {
    mission: MISSION_V2,
    identity: IDENTITY_V2,
    guards: GUARDS_V2,
    receptive: RECEPTIVE_V2,
    outbound: OUTBOUND_V2,
    commercial: COMMERCIAL_V2,
    spotify_overview: SPOTIFY_OVERVIEW,
    spotify_playlist: SPOTIFY_PLAYLIST,
    spotify_followers: SPOTIFY_FOLLOWERS,
    instagram: INSTAGRAM_V2,
    youtube: YOUTUBE_V2,
    tiktok: TIKTOK_V2,
    facebook: FACEBOOK_V2,
    kwai: KWAI_V2,
    panel: PANEL_V2,
    payments: PAYMENTS_V2,
    tutorials: TUTORIALS_V2,
    free_test: FREE_TEST_V2,
    support: SUPPORT_V2,
};
export const TUTORIAL_CONTENT = {
    registration: 'Tutorial de Cadastro: Acesse o painel, clique em cadastre-se, preencha seus dados e confirme seu email.',
    recharge: 'Tutorial de Recarga: Menu lateral > Adicionar Saldo > Escolha o valor (mín R$5) > Pague via PIX.',
    order: 'Tutorial de Pedido: Menu Novo Pedido > Escolha a Rede > Escolha o Serviço > Cole o Link > Defina a Quantidade > Enviar.',
    service_location: 'Tutorial Localizar Serviço: Use a barra de busca no painel para digitar o nome da rede ou serviço desejado.',
    link_field: 'Tutorial Campo Link: Para seguidores, use o link do perfil. Para curtidas, use o link da postagem.',
};
