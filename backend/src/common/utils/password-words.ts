/** Exactly 5-letter recognizable Nigerian native-language / local names (lowercase) */
const NORMALIZED = Array.from(
  new Set(
    [
      'bayo', 'chidi', 'ademi', 'ngozi', 'kemis', 'tunde', 'amaka', 'efeka',
      'zaina', 'hadiz', 'sadia', 'yemis', 'obina', 'chika', 'nneka', 'folak',
      'gbemi', 'ifema', 'jumok', 'kudis', 'larai', 'mojis', 'nikes', 'opemi',
      'pejua', 'remis', 'seunb', 'tobis', 'wumis', 'yetun', 'zikor', 'adaob',
      'ebube', 'chuka', 'damil', 'eniol', 'funmi', 'halim', 'ijema', 'jokea',
      'kehin', 'lolas', 'modup', 'nabil', 'olami', 'patis', 'ronke', 'simis',
      'tiwas', 'uches', 'vivis', 'wales', 'yinka', 'zarah', 'abiol',
      'bolas', 'chike', 'doyin', 'eseog', 'folas', 'gbeng', 'hauwa', 'iyanu',
      'jides', 'kolas', 'lanre', 'muiza', 'nuras', 'olase', 'pasua', 'quadi',
      'rafis', 'sulas', 'taiwo', 'usman', 'wuras', 'yusuf', 'zubai', 'adeoy',
      'bimbo', 'chiom', 'dabir', 'efeya', 'farid', 'godis', 'habib', 'isola',
      'jafar', 'khali', 'latif', 'mubin', 'omola', 'petra', 'qasim',
      'risha', 'sakin', 'tolua', 'umaru', 'adeba', 'bunmi', 'chiso', 'dayoa',
      'ejike', 'femis', 'gifti', 'henry', 'idowe', 'joyce', 'kamsi', 'lovet',
      'mercy', 'ndidi', 'osaso', 'peace', 'queen', 'ritaa', 'solom', 'titil',
    ]
      .map((w) => w.toLowerCase().replace(/[^a-z]/g, '').padEnd(5, 'a').slice(0, 5))
      .filter((w) => w.length === 5),
  ),
);

export function generateNigerianPassword(): string {
  return NORMALIZED[Math.floor(Math.random() * NORMALIZED.length)];
}
