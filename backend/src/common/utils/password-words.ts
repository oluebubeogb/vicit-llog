/** Exactly 5-letter recognizable Nigerian native-language / local names */
const NORMALIZED = Array.from(
  new Set(
    [
      'BAYO', 'CHIDI', 'ADEMI', 'NGOZI', 'KEMIS', 'TUNDE', 'AMAKA', 'EFEKA',
      'ZAINA', 'HADIZ', 'SADIA', 'YEMIS', 'OBINA', 'CHIKA', 'NNEKA', 'FOLAK',
      'GBEMI', 'IFEMA', 'JUMOK', 'KUDIS', 'LARAI', 'MOJIS', 'NIKES', 'OPEMI',
      'PEJUA', 'REMIS', 'SEUNB', 'TOBIS', 'WUMIS', 'YETUN', 'ZIKOR', 'ADAOB',
      'EBUBE', 'CHUKA', 'DAMIL', 'ENIOL', 'FUNMI', 'HALIM', 'IJEMA', 'JOKEA',
      'KEHIN', 'LOLAS', 'MODUP', 'NABIL', 'OLAMI', 'PATIS', 'RONKE', 'SIMIS',
      'TIWAS', 'UCHES', 'VIVIS', 'WALES', 'YINKA', 'ZARAH', 'ABIOL',
      'BOLAS', 'CHIKE', 'DOYIN', 'ESEOG', 'FOLAS', 'GBENG', 'HAUWA', 'IYANU',
      'JIDES', 'KOLAS', 'LANRE', 'MUIZA', 'NURAS', 'OLASE', 'PASUA', 'QUADI',
      'RAFIS', 'SULAS', 'TAIWO', 'USMAN', 'WURAS', 'YUSUF', 'ZUBAI', 'ADEOY',
      'BIMBO', 'CHIOM', 'DABIR', 'EFEYA', 'FARID', 'GODIS', 'HABIB', 'ISOLA',
      'JAFAR', 'KHALI', 'LATIF', 'MUBIN', 'OMOLA', 'PETRA', 'QASIM',
      'RISHA', 'SAKIN', 'TOLUA', 'UMARU', 'ADEBA', 'BUNMI', 'CHISO', 'DAYO',
      'EJIKE', 'FEMIS', 'GIFTI', 'HENRY', 'IDOWE', 'JOYCE', 'KAMSI', 'LOVET',
      'MERCY', 'NDIDI', 'OSASO', 'PEACE', 'QUEEN', 'RITA', 'SOLOM', 'TITIL',
    ]
      .map((w) => w.toUpperCase().replace(/[^A-Z]/g, '').padEnd(5, 'A').slice(0, 5))
      .filter((w) => w.length === 5),
  ),
);

export function generateNigerianPassword(): string {
  return NORMALIZED[Math.floor(Math.random() * NORMALIZED.length)];
}
