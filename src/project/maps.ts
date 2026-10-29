import { t } from '../i18n';

/** Cidades para a rota no mapa: id, nome e coordenadas (latitude, longitude). */
export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: 'Brasil' | 'Américas' | 'Europa' | 'África e Oriente Médio' | 'Ásia e Oceania';
}

const c = (id: string, name: string, lat: number, lon: number, region: City['region']): City => ({ id, name, lat, lon, region });

/** O projeto guarda só o id: o nome é traduzido quando tem outro nome conhecido em inglês ou espanhol. */
export const CITIES: City[] = [
  // Brasil: capitais e destinos conhecidos
  c('sao-paulo', 'São Paulo', -23.55, -46.63, 'Brasil'),
  c('rio-de-janeiro', 'Rio de Janeiro', -22.91, -43.17, 'Brasil'),
  c('brasilia', 'Brasília', -15.79, -47.88, 'Brasil'),
  c('salvador', 'Salvador', -12.97, -38.5, 'Brasil'),
  c('fortaleza', 'Fortaleza', -3.73, -38.52, 'Brasil'),
  c('belo-horizonte', 'Belo Horizonte', -19.92, -43.94, 'Brasil'),
  c('manaus', 'Manaus', -3.12, -60.02, 'Brasil'),
  c('curitiba', 'Curitiba', -25.43, -49.27, 'Brasil'),
  c('recife', 'Recife', -8.05, -34.88, 'Brasil'),
  c('porto-alegre', 'Porto Alegre', -30.03, -51.23, 'Brasil'),
  c('belem', 'Belém', -1.46, -48.49, 'Brasil'),
  c('goiania', 'Goiânia', -16.68, -49.25, 'Brasil'),
  c('sao-luis', 'São Luís', -2.53, -44.3, 'Brasil'),
  c('maceio', 'Maceió', -9.67, -35.74, 'Brasil'),
  c('natal', 'Natal', -5.79, -35.21, 'Brasil'),
  c('teresina', 'Teresina', -5.09, -42.8, 'Brasil'),
  c('joao-pessoa', 'João Pessoa', -7.12, -34.86, 'Brasil'),
  c('aracaju', 'Aracaju', -10.91, -37.07, 'Brasil'),
  c('cuiaba', 'Cuiabá', -15.6, -56.1, 'Brasil'),
  c('campo-grande', 'Campo Grande', -20.47, -54.62, 'Brasil'),
  c('florianopolis', 'Florianópolis', -27.6, -48.55, 'Brasil'),
  c('vitoria', 'Vitória', -20.32, -40.34, 'Brasil'),
  c('porto-velho', 'Porto Velho', -8.76, -63.9, 'Brasil'),
  c('macapa', 'Macapá', 0.03, -51.07, 'Brasil'),
  c('boa-vista', 'Boa Vista', 2.82, -60.67, 'Brasil'),
  c('rio-branco', 'Rio Branco', -9.97, -67.81, 'Brasil'),
  c('palmas', 'Palmas', -10.18, -48.33, 'Brasil'),
  c('campinas', 'Campinas', -22.91, -47.06, 'Brasil'),
  c('santos', 'Santos', -23.96, -46.33, 'Brasil'),
  c('niteroi', 'Niterói', -22.88, -43.1, 'Brasil'),
  c('ribeirao-preto', 'Ribeirão Preto', -21.18, -47.81, 'Brasil'),
  c('sorocaba', 'Sorocaba', -23.5, -47.46, 'Brasil'),
  c('uberlandia', 'Uberlândia', -18.92, -48.28, 'Brasil'),
  c('juiz-de-fora', 'Juiz de Fora', -21.76, -43.35, 'Brasil'),
  c('londrina', 'Londrina', -23.31, -51.16, 'Brasil'),
  c('joinville', 'Joinville', -26.3, -48.85, 'Brasil'),
  c('caruaru', 'Caruaru', -8.28, -35.98, 'Brasil'),
  c('campina-grande', 'Campina Grande', -7.23, -35.88, 'Brasil'),
  c('petrolina', 'Petrolina', -9.39, -40.5, 'Brasil'),
  c('feira-de-santana', 'Feira de Santana', -12.27, -38.97, 'Brasil'),
  c('foz-do-iguacu', 'Foz do Iguaçu', -25.55, -54.59, 'Brasil'),
  c('gramado', 'Gramado', -29.38, -50.87, 'Brasil'),
  c('bonito', 'Bonito', -21.13, -56.48, 'Brasil'),
  c('porto-seguro', 'Porto Seguro', -16.45, -39.06, 'Brasil'),
  c('fernando-de-noronha', 'Fernando de Noronha', -3.85, -32.42, 'Brasil'),
  c('jericoacoara', 'Jericoacoara', -2.79, -40.51, 'Brasil'),
  c('ouro-preto', 'Ouro Preto', -20.39, -43.5, 'Brasil'),
  c('paraty', 'Paraty', -23.22, -44.71, 'Brasil'),
  c('buzios', 'Búzios', -22.75, -41.88, 'Brasil'),
  c('chapada-diamantina', 'Chapada Diamantina', -12.56, -41.39, 'Brasil'),
  c('alter-do-chao', 'Alter do Chão', -2.5, -54.95, 'Brasil'),
  c('maragogi', 'Maragogi', -9.01, -35.22, 'Brasil'),
  c('lencois-maranhenses', 'Lençóis Maranhenses', -2.49, -43.13, 'Brasil'),
  c('pipa', 'Pipa', -6.23, -35.05, 'Brasil'),
  c('ilhabela', 'Ilhabela', -23.78, -45.36, 'Brasil'),
  c('campos-do-jordao', 'Campos do Jordão', -22.74, -45.59, 'Brasil'),

  // Américas
  c('buenos-aires', 'Buenos Aires', -34.6, -58.38, 'Américas'),
  c('montevideu', t('Montevidéu'), -34.9, -56.16, 'Américas'),
  c('santiago', 'Santiago', -33.45, -70.67, 'Américas'),
  c('lima', 'Lima', -12.05, -77.04, 'Américas'),
  c('cusco', 'Cusco', -13.53, -71.97, 'Américas'),
  c('bogota', 'Bogotá', 4.71, -74.07, 'Américas'),
  c('medellin', 'Medellín', 6.24, -75.58, 'Américas'),
  c('cartagena', 'Cartagena', 10.39, -75.48, 'Américas'),
  c('quito', 'Quito', -0.18, -78.47, 'Américas'),
  c('la-paz', 'La Paz', -16.49, -68.12, 'Américas'),
  c('assuncao', t('Assunção'), -25.26, -57.58, 'Américas'),
  c('caracas', 'Caracas', 10.48, -66.9, 'Américas'),
  c('bariloche', 'Bariloche', -41.13, -71.31, 'Américas'),
  c('mendoza', 'Mendoza', -32.89, -68.83, 'Américas'),
  c('ushuaia', 'Ushuaia', -54.8, -68.3, 'Américas'),
  c('atacama', 'San Pedro de Atacama', -22.91, -68.2, 'Américas'),
  c('cidade-do-panama', t('Cidade do Panamá'), 8.98, -79.52, 'Américas'),
  c('cidade-do-mexico', t('Cidade do México'), 19.43, -99.13, 'Américas'),
  c('cancun', 'Cancún', 21.16, -86.85, 'Américas'),
  c('havana', t('Havana'), 23.11, -82.37, 'Américas'),
  c('punta-cana', 'Punta Cana', 18.58, -68.4, 'Américas'),
  c('nova-york', t('Nova York'), 40.71, -74.01, 'Américas'),
  c('miami', 'Miami', 25.76, -80.19, 'Américas'),
  c('orlando', 'Orlando', 28.54, -81.38, 'Américas'),
  c('washington', 'Washington', 38.91, -77.04, 'Américas'),
  c('boston', 'Boston', 42.36, -71.06, 'Américas'),
  c('chicago', 'Chicago', 41.88, -87.63, 'Américas'),
  c('los-angeles', t('Los Angeles'), 34.05, -118.24, 'Américas'),
  c('sao-francisco', t('São Francisco'), 37.77, -122.42, 'Américas'),
  c('las-vegas', 'Las Vegas', 36.17, -115.14, 'Américas'),
  c('honolulu', 'Honolulu', 21.31, -157.86, 'Américas'),
  c('toronto', 'Toronto', 43.65, -79.38, 'Américas'),
  c('montreal', 'Montreal', 45.5, -73.57, 'Américas'),
  c('vancouver', 'Vancouver', 49.28, -123.12, 'Américas'),

  // Europa
  c('lisboa', t('Lisboa'), 38.72, -9.14, 'Europa'),
  c('porto', t('Porto'), 41.15, -8.61, 'Europa'),
  c('madri', t('Madri'), 40.42, -3.7, 'Europa'),
  c('barcelona', 'Barcelona', 41.39, 2.17, 'Europa'),
  c('paris', t('Paris'), 48.86, 2.35, 'Europa'),
  c('londres', t('Londres'), 51.51, -0.13, 'Europa'),
  c('dublin', t('Dublin'), 53.35, -6.26, 'Europa'),
  c('amsterda', t('Amsterdã'), 52.37, 4.9, 'Europa'),
  c('bruxelas', t('Bruxelas'), 50.85, 4.35, 'Europa'),
  c('berlim', t('Berlim'), 52.52, 13.4, 'Europa'),
  c('munique', t('Munique'), 48.14, 11.58, 'Europa'),
  c('zurique', t('Zurique'), 47.38, 8.54, 'Europa'),
  c('roma', t('Roma'), 41.9, 12.5, 'Europa'),
  c('milao', t('Milão'), 45.46, 9.19, 'Europa'),
  c('veneza', t('Veneza'), 45.44, 12.32, 'Europa'),
  c('florenca', t('Florença'), 43.77, 11.26, 'Europa'),
  c('napoles', t('Nápoles'), 40.85, 14.27, 'Europa'),
  c('atenas', t('Atenas'), 37.98, 23.73, 'Europa'),
  c('santorini', 'Santorini', 36.39, 25.46, 'Europa'),
  c('viena', t('Viena'), 48.21, 16.37, 'Europa'),
  c('praga', t('Praga'), 50.08, 14.44, 'Europa'),
  c('budapeste', t('Budapeste'), 47.5, 19.04, 'Europa'),
  c('varsovia', t('Varsóvia'), 52.23, 21.01, 'Europa'),
  c('copenhague', t('Copenhague'), 55.68, 12.57, 'Europa'),
  c('estocolmo', t('Estocolmo'), 59.33, 18.07, 'Europa'),
  c('oslo', 'Oslo', 59.91, 10.75, 'Europa'),
  c('helsinque', t('Helsinque'), 60.17, 24.94, 'Europa'),
  c('reykjavik', 'Reykjavík', 64.15, -21.94, 'Europa'),
  c('moscou', t('Moscou'), 55.76, 37.62, 'Europa'),
  c('istambul', t('Istambul'), 41.01, 28.98, 'Europa'),

  // África e Oriente Médio
  c('cairo', t('Cairo'), 30.04, 31.24, 'África e Oriente Médio'),
  c('marrakech', t('Marrakech'), 31.63, -8.01, 'África e Oriente Médio'),
  c('cidade-do-cabo', t('Cidade do Cabo'), -33.92, 18.42, 'África e Oriente Médio'),
  c('joanesburgo', t('Joanesburgo'), -26.2, 28.05, 'África e Oriente Médio'),
  c('luanda', 'Luanda', -8.84, 13.23, 'África e Oriente Médio'),
  c('maputo', 'Maputo', -25.97, 32.57, 'África e Oriente Médio'),
  c('lagos', 'Lagos', 6.52, 3.38, 'África e Oriente Médio'),
  c('nairobi', t('Nairóbi'), -1.29, 36.82, 'África e Oriente Médio'),
  c('praia', t('Praia (Cabo Verde)'), 14.93, -23.51, 'África e Oriente Médio'),
  c('dubai', 'Dubai', 25.2, 55.27, 'África e Oriente Médio'),
  c('tel-aviv', 'Tel Aviv', 32.09, 34.78, 'África e Oriente Médio'),
  c('doha', 'Doha', 25.29, 51.53, 'África e Oriente Médio'),

  // Ásia e Oceania
  c('toquio', t('Tóquio'), 35.68, 139.69, 'Ásia e Oceania'),
  c('quioto', t('Quioto'), 35.01, 135.77, 'Ásia e Oceania'),
  c('seul', t('Seul'), 37.57, 126.98, 'Ásia e Oceania'),
  c('pequim', t('Pequim'), 39.9, 116.41, 'Ásia e Oceania'),
  c('xangai', t('Xangai'), 31.23, 121.47, 'Ásia e Oceania'),
  c('hong-kong', 'Hong Kong', 22.32, 114.17, 'Ásia e Oceania'),
  c('bangkok', 'Bangkok', 13.76, 100.5, 'Ásia e Oceania'),
  c('singapura', t('Singapura'), 1.35, 103.82, 'Ásia e Oceania'),
  c('bali', 'Bali', -8.65, 115.22, 'Ásia e Oceania'),
  c('manila', 'Manila', 14.6, 120.98, 'Ásia e Oceania'),
  c('nova-delhi', t('Nova Délhi'), 28.61, 77.21, 'Ásia e Oceania'),
  c('mumbai', 'Mumbai', 19.08, 72.88, 'Ásia e Oceania'),
  c('male', t('Maldivas'), 4.18, 73.51, 'Ásia e Oceania'),
  c('sydney', 'Sydney', -33.87, 151.21, 'Ásia e Oceania'),
  c('melbourne', 'Melbourne', -37.81, 144.96, 'Ásia e Oceania'),
  c('auckland', 'Auckland', -36.85, 174.76, 'Ásia e Oceania'),
];

/** As regiões agrupam as cidades (são comparadas): ficam em português e são traduzidas na hora de mostrar. */
export const CITY_REGIONS: City['region'][] = ['Brasil', 'Américas', 'Europa', 'África e Oriente Médio', 'Ásia e Oceania'];

export function findCity(id: string): City | undefined {
  return CITIES.find((x) => x.id === id);
}

/** Projeção de Mercator (x e y de 0 a 1; y para baixo). */
export function mercator(lat: number, lon: number): [number, number] {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [(lon + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)];
}

/**
 * Pontos da rota na projeção, "desenrolados" para a viagem pegar o caminho mais curto
 * (Tóquio → Los Angeles cruza o Pacífico, não o mapa inteiro).
 */
export function routePoints(stops: string[]): { city: City; x: number; y: number }[] {
  const out: { city: City; x: number; y: number }[] = [];
  for (const id of stops) {
    const city = findCity(id);
    if (!city) continue;
    let [x, y] = mercator(city.lat, city.lon);
    const prev = out[out.length - 1];
    if (prev) while (x - prev.x > 0.5) x -= 1;
    if (prev) while (prev.x - x > 0.5) x += 1;
    out.push({ city, x, y });
  }
  return out;
}
