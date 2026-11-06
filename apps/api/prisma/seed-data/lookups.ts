/**
 * Starting lists. They are only a starting point: the CEO adds and corrects
 * ports, carriers and yards from the lookups screen. A code is left out where
 * it was not certain, rather than risk a wrong one.
 */

/** [name, UN/LOCODE or null] — Egyptian sea ports. */
export const EGYPT_SEA_PORTS: [string, string | null][] = [
  ['Alexandria', 'EGALY'],
  ['El Dekheila', 'EGEDK'],
  ['Damietta', 'EGDAM'],
  ['Port Said', 'EGPSD'],
  ['East Port Said', null],
  ['Sokhna', 'EGSOK'],
  ['Adabiya', null],
  ['Safaga', null],
];

/** [name, IATA] — Egyptian airports. */
export const EGYPT_AIRPORTS: [string, string][] = [
  ['Cairo International', 'CAI'],
  ['Borg El Arab', 'HBE'],
  ['Sphinx International', 'SPX'],
  ['Hurghada', 'HRG'],
  ['Sharm El Sheikh', 'SSH'],
  ['Luxor', 'LXR'],
  ['Aswan', 'ASW'],
  ['Assiut', 'ATZ'],
];

/** [name, UN/LOCODE] — main world container ports (country = first 2 letters). */
export const WORLD_SEA_PORTS: [string, string][] = [
  ['Shanghai', 'CNSHA'],
  ['Ningbo', 'CNNGB'],
  ['Shenzhen (Yantian)', 'CNYTN'],
  ['Qingdao', 'CNTAO'],
  ['Tianjin', 'CNTSN'],
  ['Xiamen', 'CNXMN'],
  ['Guangzhou (Nansha)', 'CNNSA'],
  ['Hong Kong', 'HKHKG'],
  ['Kaohsiung', 'TWKHH'],
  ['Busan', 'KRPUS'],
  ['Tokyo', 'JPTYO'],
  ['Yokohama', 'JPYOK'],
  ['Singapore', 'SGSIN'],
  ['Port Klang', 'MYPKG'],
  ['Tanjung Pelepas', 'MYTPP'],
  ['Laem Chabang', 'THLCH'],
  ['Ho Chi Minh City', 'VNSGN'],
  ['Haiphong', 'VNHPH'],
  ['Jakarta', 'IDJKT'],
  ['Colombo', 'LKCMB'],
  ['Nhava Sheva', 'INNSA'],
  ['Mundra', 'INMUN'],
  ['Chennai', 'INMAA'],
  ['Karachi', 'PKKHI'],
  ['Jebel Ali', 'AEJEA'],
  ['Jeddah', 'SAJED'],
  ['Dammam', 'SADMM'],
  ['Aqaba', 'JOAQJ'],
  ['Beirut', 'LBBEY'],
  ['Mersin', 'TRMER'],
  ['Ambarli', 'TRAMR'],
  ['Izmir', 'TRIZM'],
  ['Piraeus', 'GRPIR'],
  ['Genoa', 'ITGOA'],
  ['La Spezia', 'ITSPE'],
  ['Valencia', 'ESVLC'],
  ['Barcelona', 'ESBCN'],
  ['Algeciras', 'ESALG'],
  ['Marseille', 'FRMRS'],
  ['Le Havre', 'FRLEH'],
  ['Rotterdam', 'NLRTM'],
  ['Antwerp', 'BEANR'],
  ['Hamburg', 'DEHAM'],
  ['Bremerhaven', 'DEBRV'],
  ['Felixstowe', 'GBFXT'],
  ['New York', 'USNYC'],
  ['Savannah', 'USSAV'],
  ['Houston', 'USHOU'],
  ['Los Angeles', 'USLAX'],
  ['Santos', 'BRSSZ'],
  ['Casablanca', 'MACAS'],
  ['Mombasa', 'KEMBA'],
  ['Durban', 'ZADUR'],
];

/** [name, IATA, country] — main world cargo airports. */
export const WORLD_AIRPORTS: [string, string, string][] = [
  ['Shanghai Pudong', 'PVG', 'CN'],
  ['Beijing Capital', 'PEK', 'CN'],
  ['Guangzhou Baiyun', 'CAN', 'CN'],
  ['Shenzhen Bao’an', 'SZX', 'CN'],
  ['Hong Kong', 'HKG', 'HK'],
  ['Taipei Taoyuan', 'TPE', 'TW'],
  ['Seoul Incheon', 'ICN', 'KR'],
  ['Tokyo Narita', 'NRT', 'JP'],
  ['Singapore Changi', 'SIN', 'SG'],
  ['Kuala Lumpur', 'KUL', 'MY'],
  ['Bangkok Suvarnabhumi', 'BKK', 'TH'],
  ['Mumbai', 'BOM', 'IN'],
  ['Delhi', 'DEL', 'IN'],
  ['Dubai', 'DXB', 'AE'],
  ['Doha', 'DOH', 'QA'],
  ['Riyadh', 'RUH', 'SA'],
  ['Jeddah', 'JED', 'SA'],
  ['Istanbul', 'IST', 'TR'],
  ['Frankfurt', 'FRA', 'DE'],
  ['Amsterdam Schiphol', 'AMS', 'NL'],
  ['Paris Charles de Gaulle', 'CDG', 'FR'],
  ['London Heathrow', 'LHR', 'GB'],
  ['Milan Malpensa', 'MXP', 'IT'],
  ['Madrid Barajas', 'MAD', 'ES'],
  ['New York JFK', 'JFK', 'US'],
  ['Chicago O’Hare', 'ORD', 'US'],
  ['Los Angeles', 'LAX', 'US'],
];

/**
 * Shipping lines in Egypt, in list order. Global lines first by fleet capacity
 * (Alphaliner 2026 ranking), then the lines and agencies the office works with.
 * The CEO can reorder them later (carriers.sort_order).
 */
export const SHIPPING_LINES = [
  'MSC',
  'Maersk',
  'CMA CGM',
  'COSCO',
  'OOCL',
  'Hapag-Lloyd',
  'ONE',
  'Evergreen',
  'HMM',
  'Yang Ming',
  'ZIM',
  'Wan Hai',
  'PIL',
  'X-Press Feeders',
  'Emirates Shipping Line',
  'Grimaldi',
  'Arkas',
  'Turkon',
  'B&G',
  'خدمات الشحن المصرية',
  'MLH',
  'MED EGYPT',
  'MEDKON',
  'SEA GLORY',
  'TRY STAR',
  'SACCO',
  'EL FATTH',
  'EGL',
  'ADMIRAL',
  'OCEAN EXPRESS',
  'FINMAR',
  'G MAC',
  'NUTIC',
];

export const AIRLINES = [
  'EgyptAir Cargo',
  'Emirates SkyCargo',
  'Qatar Airways Cargo',
  'Turkish Cargo',
  'Saudia Cargo',
  'Etihad Cargo',
  'Lufthansa Cargo',
  'Air France KLM Martinair Cargo',
  'Cathay Cargo',
  'China Southern Cargo',
];

/** Yards and terminals, by the Egyptian port (code, or name when it has no code) they belong to. */
export const STORAGE_YARDS: {
  port: string;
  kind: 'SEA' | 'AIR';
  names: string[];
}[] = [
  {
    port: 'EGALY',
    kind: 'SEA',
    names: [
      'حاويات الإسكندرية',
      'تحيا مصر',
      'صينية الإسكندرية',
      'خدمات الشحن',
      'أركاس',
      'طاروس',
      'أوشن إكسبريس الإسكندرية',
      'ميناء أبو قير البحري',
    ],
  },
  {
    port: 'EGEDK',
    kind: 'SEA',
    names: ['حاويات الدخيلة', 'صينية الدخيلة', 'أوشن إكسبريس الدخيلة'],
  },
  {
    port: 'EGSOK',
    kind: 'SEA',
    names: ['ساحة 600 السخنة', 'ساحة 800 السخنة', 'حاويات البحر الأحمر'],
  },
  {
    port: 'EGDAM',
    kind: 'SEA',
    names: ['حاويات دمياط (DCHC)', 'Damietta Alliance (DACT)'],
  },
  {
    port: 'East Port Said',
    kind: 'SEA',
    names: ['قناة السويس للحاويات (SCCT)'],
  },
  {
    port: 'EGPSD',
    kind: 'SEA',
    names: ['بورسعيد لتداول الحاويات'],
  },
  { port: 'CAI', kind: 'AIR', names: ['قرية البضائع - مطار القاهرة'] },
  { port: 'HBE', kind: 'AIR', names: ['مبنى الشحن - مطار برج العرب'] },
];
