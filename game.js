/* ============================================================
   SIGNAL — js/game.js
   Cœur du jeu : état global, calculs de production, boucle
   à 60 fps (requestAnimationFrame), progression hors-ligne,
   et initialisation générale.
   ============================================================ */

/* ------------------------------------------------------------
   ÉTAT GLOBAL DU JEU
   Toutes les autres modules lisent et écrivent dans cet objet.
   ------------------------------------------------------------ */
const GameState = {
  version: 1,
  phase: 1,
  resources: { likes: 0, opinions: 0, dependances: 0, controle: 0 },
  totals: { likes: 0, opinions: 0 },   // cumuls servant aux seuils de phase
  clickBase: 1,                        // likes de base par clic
  clickMult: 1,                        // multiplicateur de clic (améliorations)
  prodMult: 1,                         // multiplicateur de production (améliorations)
  moral: 100,                          // indice moral (chute en phase 2+)
  timePlayed: 0,                       // temps de jeu en secondes
  lastSave: Date.now(),
  ending: null,                        // 'A' | 'B' | null
  fini: false,                         // true une fois une fin atteinte
  flags: {
    phase2Unlocked: false,
    phase3Unlocked: false,
    finalChoiceShown: false,
    dernierMessage: 0
  }
};

/* ------------------------------------------------------------
   CONSTANTES DE CONVERSION
   Les opinions et dépendances découlent en partie des ressources
   précédentes — d'où ces ratios de conversion passive.
   ------------------------------------------------------------ */
const CONV = {
  likesVersOpinions: 0.001,        // une fraction de la prod de likes devient opinions
  opinionsVersDependances: 0.01,   // une fraction des opinions devient dépendances
  depVersControle: 1,              // les dépendances alimentent directement le contrôle
  opVersControle: 0.0001,          // léger apport des opinions
  controleBase: 0.1                // apport de base, garantit que le contrôle progresse
};

/* ------------------------------------------------------------
   CALCULS DE PRODUCTION (par seconde)
   ------------------------------------------------------------ */

// Likes gagnés par clic (base × multiplicateur des améliorations)
function valeurClic() {
  return GameState.clickBase * GameState.clickMult;
}

// Likes produits automatiquement par seconde
function prodLikesParSec() {
  let s = 0;
  BUILDINGS.forEach(b => { if (b.ressource === 'likes') s += b.prod * b.owned; });
  return s * GameState.prodMult;
}

// Opinions produites par seconde (phase 2+) : bâtiments + conversion des likes
function prodOpinionsParSec() {
  if (GameState.phase < 2) return 0;
  let s = 0;
  BUILDINGS.forEach(b => { if (b.ressource === 'opinions') s += b.prod * b.owned; });
  s *= GameState.prodMult;
  s += prodLikesParSec() * CONV.likesVersOpinions; // conversion passive
  return s;
}

// Dépendances produites par seconde (phase 2+) : bâtiments + conversion des opinions
function prodDependancesParSec() {
  if (GameState.phase < 2) return 0;
  let s = 0;
  BUILDINGS.forEach(b => { if (b.ressource === 'dependances') s += b.prod * b.owned; });
  s *= GameState.prodMult;
  s += prodOpinionsParSec() * CONV.opinionsVersDependances;
  return s;
}

// Contrôle produit par seconde (phase 3) : abstrait, auto-généré
function prodControleParSec() {
  if (GameState.phase < 3) return 0;
  const base = prodDependancesParSec() * CONV.depVersControle
             + prodOpinionsParSec() * CONV.opVersControle
             + CONV.controleBase;
  return base * GameState.prodMult;
}

/* ------------------------------------------------------------
   ACTION DE CLIC (zone centrale)
   ------------------------------------------------------------ */
function clicCentral(e) {
  if (GameState.fini) return;
  const gain = valeurClic();
  GameState.resources.likes += gain;
  GameState.totals.likes += gain;

  // Texte flottant « +X » à la position du curseur
  if (e && typeof e.clientX === 'number') {
    UI.floater(e.clientX, e.clientY, '+' + formatNombre(gain));
  }
}

/* ------------------------------------------------------------
   APPLICATION DE LA PRODUCTION sur un intervalle dt (secondes)
   ------------------------------------------------------------ */
function appliquerProduction(dt) {
  // Likes
  const dLikes = prodLikesParSec() * dt;
  GameState.resources.likes += dLikes;
  GameState.totals.likes += dLikes;

  // Opinions + dépendances + indice moral (phase 2+)
  if (GameState.phase >= 2) {
    const opSec = prodOpinionsParSec();
    const dOp = opSec * dt;
    GameState.resources.opinions += dOp;
    GameState.totals.opinions += dOp;
    GameState.resources.dependances += prodDependancesParSec() * dt;

    // L'indice moral chute, d'autant plus vite que l'on produit d'opinions
    const declin = (0.15 + Math.min(1.5, opSec / 1e6)) * dt;
    GameState.moral = Math.max(0, GameState.moral - declin);
  }

  // Contrôle (phase 3)
  if (GameState.phase >= 3) {
    GameState.resources.controle += prodControleParSec() * dt;
  }
}

/* ------------------------------------------------------------
   PROGRESSION HORS-LIGNE (au chargement)
   On calcule ce qui aurait été produit pendant l'absence,
   plafonné à 24 heures.
   ------------------------------------------------------------ */
function progresserHorsLigne(data) {
  if (!data || !data.lastSave) return;
  let dt = (Date.now() - data.lastSave) / 1000;
  if (dt < 5) return;                 // absence négligeable
  dt = Math.min(dt, 86400);           // plafond : 24 heures

  const avant = {
    likes: GameState.resources.likes,
    opinions: GameState.resources.opinions,
    dependances: GameState.resources.dependances,
    controle: GameState.resources.controle
  };

  appliquerProduction(dt);
  GameState.timePlayed += dt;

  const gains = {
    likes: GameState.resources.likes - avant.likes,
    opinions: GameState.resources.opinions - avant.opinions,
    dependances: GameState.resources.dependances - avant.dependances,
    controle: GameState.resources.controle - avant.controle
  };

  if (gains.likes > 0 || gains.opinions > 0 || gains.dependances > 0 || gains.controle > 0) {
    UI.afficherOffline(dt, gains);
  }
}

/* ------------------------------------------------------------
   BOUCLE DE JEU (requestAnimationFrame, ~60 fps)
   ------------------------------------------------------------ */
let dernierTemps = 0;   // horodatage de la frame précédente
let accumRender = 0;    // accumulateur pour le rafraîchissement des listes

function boucle(maintenant) {
  if (!dernierTemps) dernierTemps = maintenant;
  let dt = (maintenant - dernierTemps) / 1000; // delta time en secondes
  dernierTemps = maintenant;

  // On borne dt pour éviter un saut énorme si l'onglet a été en arrière-plan
  if (dt > 1) dt = 1;
  if (dt < 0) dt = 0;

  if (!GameState.fini) {
    appliquerProduction(dt);
    GameState.timePlayed += dt;
    verifierPhases();
  }

  // Mise à jour des chiffres à l'écran à chaque frame (comptage fluide)
  UI.majStats();

  // Rafraîchissement des listes d'achats ~4 fois par seconde
  accumRender += dt;
  if (accumRender >= 0.25) {
    accumRender = 0;
    UI.rafraichirListes();
  }

  requestAnimationFrame(boucle);
}

/* ------------------------------------------------------------
   INITIALISATION
   ------------------------------------------------------------ */
function init() {
  // Chargement de la sauvegarde existante (le cas échéant)
  const data = Save.charger();
  if (data) {
    GameState.fini = !!GameState.ending;
    progresserHorsLigne(data);
  } else {
    recalculerEffets(); // multiplicateurs par défaut pour une nouvelle partie
  }

  // Thème visuel correspondant à la phase courante
  document.body.className = 'phase-' + GameState.phase;

  // Mise en place de l'interface
  UI.appliquerPhaseUI();
  UI.initEvenements();
  UI.rendreBatiments();
  UI.rendreAmeliorations();

  // Reprise d'une partie déjà terminée ou déjà au stade du choix final
  if (GameState.ending) {
    afficherEnding(GameState.ending);
  } else if (GameState.phase === 3 && GameState.flags.finalChoiceShown) {
    document.getElementById('final-choice').classList.remove('hidden');
  } else if (GameState.phase === 3) {
    afficherMessageIA(0);
  }

  // Sauvegarde automatique + horodatage en direct
  Save.demarrerAutoSave();
  Save.demarrerHorodatage();
  Save.majHorodatage();

  // Démarrage de la boucle
  requestAnimationFrame(boucle);
}

// Lancement une fois le DOM prêt (tous les scripts sont alors parsés)
window.addEventListener('DOMContentLoaded', init);
