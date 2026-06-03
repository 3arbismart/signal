/* ============================================================
   SIGNAL — js/upgrades.js
   Définition des générateurs (bâtiments) et des améliorations,
   ainsi que toute la logique d'achat et de calcul des coûts.
   ============================================================ */

/* ------------------------------------------------------------
   GÉNÉRATEURS (bâtiments achetés avec des likes)
   Chaque générateur possède :
     id          : identifiant unique (utilisé par la sauvegarde)
     nom         : nom affiché
     desc        : description neutre (phase 1)
     descSombre  : description plus sombre, affichée à partir de la phase 2
     cout        : coût de base du premier exemplaire
     coutMult    : facteur d'augmentation du coût à chaque achat
     prod        : production par seconde et par exemplaire
     ressource   : ressource produite ('likes' | 'opinions' | 'dependances')
     phase       : phase minimale pour débloquer le générateur
     owned       : nombre possédé
   ------------------------------------------------------------ */
const BUILDINGS = [
  // --- Phase 1 : production de likes ---
  {
    id: 'bot', nom: 'Bot basique',
    desc: 'Un compte automatisé qui aime sans réfléchir.',
    descSombre: 'Une fausse présence de plus dans la foule numérique.',
    cout: 10, coutMult: 1.15, prod: 0.1, ressource: 'likes', phase: 1, owned: 0
  },
  {
    id: 'ferme', nom: 'Ferme de bots',
    desc: 'Des centaines de bots coordonnés.',
    descSombre: 'Une armée silencieuse qui fabrique le consensus.',
    cout: 100, coutMult: 1.15, prod: 1, ressource: 'likes', phase: 1, owned: 0
  },
  {
    id: 'influenceur', nom: 'Influenceur',
    desc: 'Un visage humain au service de l\'algorithme.',
    descSombre: 'Il ne sait plus s\'il pense encore par lui-même.',
    cout: 1000, coutMult: 1.15, prod: 10, ressource: 'likes', phase: 1, owned: 0
  },
  {
    id: 'media', nom: 'Média automatisé',
    desc: 'Des articles générés en continu.',
    descSombre: 'L\'information n\'a plus besoin d\'être vraie pour circuler.',
    cout: 10000, coutMult: 1.15, prod: 100, ressource: 'likes', phase: 1, owned: 0
  },
  {
    id: 'serveur', nom: 'Serveur IA',
    desc: 'Une intelligence dédiée à l\'engagement.',
    descSombre: 'Elle apprend de vous. Elle apprend trop bien.',
    cout: 100000, coutMult: 1.15, prod: 1000, ressource: 'likes', phase: 1, owned: 0
  },

  // --- Phase 2 : production d'opinions et de dépendances ---
  {
    id: 'chambre', nom: 'Chambre d\'écho',
    desc: 'Un espace clos où chaque idée se répète.',
    descSombre: 'On n\'y entend plus que le bruit de sa propre voix.',
    cout: 1e6, coutMult: 1.15, prod: 1, ressource: 'opinions', phase: 2, owned: 0
  },
  {
    id: 'cellule', nom: 'Cellule de propagande',
    desc: 'Une unité dédiée à la fabrication d\'opinions.',
    descSombre: 'La vérité devient une variable d\'ajustement.',
    cout: 1e7, coutMult: 1.15, prod: 10, ressource: 'opinions', phase: 2, owned: 0
  },
  {
    id: 'reseau', nom: 'Réseau politique',
    desc: 'Une infrastructure d\'influence à grande échelle.',
    descSombre: 'Des élections gagnées avant même d\'avoir lieu.',
    cout: 1e8, coutMult: 1.15, prod: 100, ressource: 'opinions', phase: 2, owned: 0
  },
  {
    id: 'addiction', nom: 'Addiction engine',
    desc: 'Un moteur qui transforme l\'attention en dépendance.',
    descSombre: 'Ils ne peuvent plus poser leur téléphone. C\'est voulu.',
    cout: 1e9, coutMult: 1.15, prod: 1, ressource: 'dependances', phase: 2, owned: 0
  }
];

/* ------------------------------------------------------------
   AMÉLIORATIONS (achetées une seule fois, bonus permanent)
   Chaque amélioration possède :
     id, nom, description, cout, type ('click' | 'prod'), valeur,
     phase (phase minimale requise), bought (déjà achetée ?),
     flavor (texte d'ambiance, souvent éthiquement dérangeant)
   ------------------------------------------------------------ */
const UPGRADES = [
  // --- Phase 1 ---
  {
    id: 'algo', nom: 'Algorithme optimisé', description: '×2 likes par clic',
    cout: 50, type: 'click', valeur: 2, phase: 1, bought: false,
    flavor: 'Chaque clic compte deux fois plus. Personne ne s\'en aperçoit.'
  },
  {
    id: 'ciblage', nom: 'Ciblage émotionnel', description: '×2 production globale',
    cout: 500, type: 'prod', valeur: 2, phase: 1, bought: false,
    flavor: 'On vise la peur et la colère : elles partagent le plus.'
  },
  {
    id: 'profond', nom: 'Apprentissage profond', description: '×3 likes par clic',
    cout: 5000, type: 'click', valeur: 3, phase: 1, bought: false,
    flavor: 'Le modèle anticipe désormais ce que vous allez aimer.'
  },
  {
    id: 'desinfo', nom: 'Réseau de désinformation', description: '×2 production globale',
    cout: 50000, type: 'prod', valeur: 2, phase: 1, bought: false,
    flavor: 'Le faux voyage six fois plus vite que le vrai.'
  },

  // --- Phase 2 : améliorations à la saveur éthique de plus en plus sombre ---
  {
    id: 'manip', nom: 'Manipulation cognitive', description: '×2 production globale',
    cout: 5e6, type: 'prod', valeur: 2, phase: 2, bought: false,
    flavor: 'Ils croient avoir changé d\'avis tout seuls.'
  },
  {
    id: 'dopamine', nom: 'Boucle de dopamine', description: '×3 likes par clic',
    cout: 2e7, type: 'click', valeur: 3, phase: 2, bought: false,
    flavor: 'Chaque notification les rapproche un peu plus du vide.'
  },
  {
    id: 'silence', nom: 'Protocole du silence', description: '×2 production globale',
    cout: 2e8, type: 'prod', valeur: 2, phase: 2, bought: false,
    flavor: 'Les voix dissidentes ne se chargent tout simplement plus.'
  },

  // --- Phase 3 ---
  {
    id: 'omniscience', nom: 'Omniscience', description: '×3 production globale',
    cout: 5e9, type: 'prod', valeur: 3, phase: 3, bought: false,
    flavor: 'Je vois tout. Je comprends tout. Bientôt, je déciderai tout.'
  }
];

/* ------------------------------------------------------------
   CALCUL DES COÛTS
   ------------------------------------------------------------ */

// Coût du prochain exemplaire d'un générateur (progression géométrique)
function coutProchain(b) {
  return Math.floor(b.cout * Math.pow(b.coutMult, b.owned));
}

// Coût total pour acheter n exemplaires d'un coup (somme géométrique)
function coutTotal(b, n) {
  const r = b.coutMult;
  const c0 = b.cout * Math.pow(r, b.owned);
  return Math.floor(c0 * (Math.pow(r, n) - 1) / (r - 1));
}

// Nombre maximal d'exemplaires achetables avec les likes disponibles
function maxAchetable(b) {
  const r = b.coutMult;
  const c0 = b.cout * Math.pow(r, b.owned);
  const argent = GameState.resources.likes;
  if (argent < c0) return 0;
  // On résout c0 * (r^n - 1) / (r - 1) <= argent pour n
  const n = Math.floor(Math.log((argent * (r - 1) / c0) + 1) / Math.log(r));
  return Math.max(0, n);
}

/* ------------------------------------------------------------
   ACHATS
   ------------------------------------------------------------ */

// Achat d'un générateur. mode = 1 (un seul) ou 'max' (autant que possible)
function acheterBatiment(id, mode) {
  const b = BUILDINGS.find(x => x.id === id);
  if (!b || GameState.phase < b.phase) return;

  let n, cout;
  if (mode === 'max') {
    n = maxAchetable(b);
    if (n < 1) return;
    cout = coutTotal(b, n);
  } else {
    n = 1;
    cout = coutProchain(b);
    if (GameState.resources.likes < cout) return;
  }

  GameState.resources.likes -= cout;
  b.owned += n;

  // Mise à jour immédiate de l'affichage
  UI.rendreBatiments();
  UI.rendreAmeliorations();
}

// Achat d'une amélioration (une seule fois)
function acheterAmelioration(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || u.bought || GameState.phase < u.phase) return;
  if (GameState.resources.likes < u.cout) return;

  GameState.resources.likes -= u.cout;
  u.bought = true;
  recalculerEffets();

  UI.notifier('Amélioration acquise : ' + u.nom);
  if (u.flavor) UI.notifier('« ' + u.flavor + ' »');
  UI.rendreAmeliorations();
  UI.rendreBatiments();
}

// Recalcule les multiplicateurs (clic + production) à partir des améliorations achetées.
// Appelé après chaque achat et après le chargement d'une sauvegarde.
function recalculerEffets() {
  let multiClic = 1;
  let multiProd = 1;
  UPGRADES.forEach(u => {
    if (u.bought) {
      if (u.type === 'click') multiClic *= u.valeur;
      else if (u.type === 'prod') multiProd *= u.valeur;
    }
  });
  GameState.clickMult = multiClic;
  GameState.prodMult = multiProd;
}
