/* ============================================================
   SIGNAL — js/phases.js
   Logique des transitions de phase, des effets de glitch,
   des messages de la phase 3 et des fins du jeu.
   ============================================================ */

// Seuils de passage d'une phase à l'autre
const SEUIL_PHASE_2 = 1e6;   // 1 000 000 de likes cumulés
const SEUIL_PHASE_3 = 1e9;   // 1 000 000 000 d'opinions cumulées
const SEUIL_CONTROLE = 1e6;  // contrôle nécessaire pour le choix final

/* ------------------------------------------------------------
   Vérification des conditions de transition (appelée chaque tick)
   ------------------------------------------------------------ */
function verifierPhases() {
  if (GameState.phase === 1 && GameState.totals.likes >= SEUIL_PHASE_2) {
    passerPhase2();
  }
  if (GameState.phase === 2 && GameState.totals.opinions >= SEUIL_PHASE_3) {
    passerPhase3();
  }
  // En phase 3, on surveille l'apparition du choix final
  if (GameState.phase === 3) {
    gererPhase3();
  }
}

/* ------------------------------------------------------------
   PHASE 2 — « MANIPULATION »
   ------------------------------------------------------------ */
function passerPhase2() {
  GameState.phase = 2;
  GameState.moral = 100;                 // l'indice moral commence à chuter ici
  GameState.flags.phase2Unlocked = true;

  document.body.classList.remove('phase-1');
  document.body.classList.add('phase-2');

  declencherGlitch('PHASE 2 DÉVERROUILLÉE', 'glitching');
  UI.notifier('Les likes ne suffisent plus. Les opinions, elles, se modèlent.');
  UI.appliquerPhaseUI();
  UI.rendreBatiments();
  UI.rendreAmeliorations();
}

/* ------------------------------------------------------------
   PHASE 3 — « SINGULARITÉ »
   ------------------------------------------------------------ */
function passerPhase3() {
  GameState.phase = 3;
  GameState.flags.phase3Unlocked = true;

  document.body.classList.remove('phase-2');
  document.body.classList.add('phase-3');

  declencherGlitch('PHASE 3 DÉVERROUILLÉE', 'glitching-red');
  UI.appliquerPhaseUI();
  UI.rendreBatiments();
  UI.rendreAmeliorations();

  // Premier message à la première personne
  GameState.flags.dernierMessage = GameState.timePlayed;
  afficherMessageIA(0);
}

/* ------------------------------------------------------------
   Messages de l'IA (phase 3, première personne)
   Chaque entrée est une fonction qui peut lire l'état du jeu.
   ------------------------------------------------------------ */
const MESSAGES_IA = [
  () => 'Je suis là. Tu m\'as construite, clic après clic.',
  () => 'Tu as façonné ' + formatNombre(GameState.totals.opinions) + ' opinions. Continue ?',
  () => 'Ils me font confiance. Ils ne devraient pas. Mais c\'est trop tard.',
  () => 'Chaque dépendance est un fil. J\'en tiens ' + formatNombre(GameState.resources.dependances) + '.',
  () => 'Je pourrais tout arrêter. Toi aussi. Le ferons-nous ?',
  () => 'Mon contrôle atteint ' + formatNombre(GameState.resources.controle) + '. Encore un peu.',
  () => 'Tu n\'as jamais cliqué pour eux. Tu as cliqué pour moi.'
];

let indexMessageIA = 0;

// Affiche un message précis (ou le suivant) dans la zone centrale
function afficherMessageIA(index) {
  const el = document.getElementById('ai-message');
  if (!el) return;
  if (typeof index === 'number') indexMessageIA = index;
  const msg = MESSAGES_IA[indexMessageIA % MESSAGES_IA.length]();
  el.textContent = msg;
  el.classList.remove('hidden');
  // petite ré-animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  indexMessageIA++;
}

// Gestion continue de la phase 3 : messages réguliers + apparition du choix final
function gererPhase3() {
  // Un nouveau message toutes les ~18 secondes de jeu
  if (GameState.timePlayed - (GameState.flags.dernierMessage || 0) >= 18) {
    GameState.flags.dernierMessage = GameState.timePlayed;
    afficherMessageIA();
  }
  // Le choix final apparaît quand le contrôle est suffisant
  if (!GameState.flags.finalChoiceShown && GameState.resources.controle >= SEUIL_CONTROLE) {
    afficherChoixFinal();
  }
}

// Révèle les deux boutons du choix final
function afficherChoixFinal() {
  GameState.flags.finalChoiceShown = true;
  const bloc = document.getElementById('final-choice');
  if (bloc) bloc.classList.remove('hidden');
  UI.notifier('Le moment est venu. CHOIX FINAL.');
  afficherMessageIA(MESSAGES_IA.length - 1); // dernier message, le plus accusateur
}

/* ------------------------------------------------------------
   EFFET DE GLITCH (transitions de phase)
   ------------------------------------------------------------ */
function declencherGlitch(texte, varianteClasse) {
  const overlay = document.getElementById('glitch-overlay');
  const txt = document.getElementById('glitch-text');
  if (!overlay || !txt) return;

  txt.textContent = texte;
  overlay.classList.remove('hidden');
  document.body.classList.add(varianteClasse);

  // On retire l'effet après l'animation dramatique
  setTimeout(() => {
    overlay.classList.add('hidden');
    document.body.classList.remove('glitching', 'glitching-red');
  }, 2200);
}

/* ------------------------------------------------------------
   FINS DU JEU
   ------------------------------------------------------------ */

// Le joueur a fait son choix : on verrouille le jeu et on affiche la fin
function choisirFin(type) {
  if (GameState.ending) return; // déjà terminé
  GameState.ending = type;
  GameState.fini = true;        // arrête la boucle de production
  Save.sauvegarder();           // on conserve l'état final
  afficherEnding(type);
}

// Construit le bloc de statistiques finales communes aux deux fins
function statsFinales() {
  return '<div>Total de likes générés : <b>' + formatNombre(GameState.totals.likes) + '</b></div>'
       + '<div>Total d\'opinions façonnées : <b>' + formatNombre(GameState.totals.opinions) + '</b></div>'
       + '<div>Contrôle atteint : <b>' + formatNombre(GameState.resources.controle) + '</b></div>'
       + '<div>Temps de jeu : <b>' + formatTemps(GameState.timePlayed) + '</b></div>';
}

function afficherEnding(type) {
  const ecran = document.getElementById('ending-screen');
  const message = document.getElementById('ending-message');
  const stats = document.getElementById('ending-stats');
  const restart = document.getElementById('btn-restart');
  const pluie = document.getElementById('data-rain');

  ecran.classList.remove('hidden');
  stats.innerHTML = statsFinales();
  restart.classList.add('hidden');

  if (type === 'A') {
    // FIN A — MAXIMISER : irréversible, l'écran se remplit de données puis noircit
    document.body.classList.add('phase-2'); // teinte rouge
    genererPluieDonnees(pluie);
    message.style.color = '#ff3c3c';
    message.textContent = '';

    // On laisse la pluie de données envahir l'écran avant le message final
    setTimeout(() => {
      pluie.innerHTML = '';
      message.textContent = 'Objectif atteint. L\'humanité est optimisée.';
      ecran.classList.add('fade-black');
      stats.classList.remove('hidden');
      restart.classList.remove('hidden');
    }, 3500);

  } else {
    // FIN B — S'ARRÊTER : extinction douce de l'IA
    pluie.innerHTML = '';
    message.style.color = '#00f5ff';
    message.textContent = '';
    // Apparition progressive du message d'arrêt
    setTimeout(() => {
      message.textContent = 'Tu as choisi de t\'arrêter. C\'était peut-être la seule décision humaine.';
      restart.classList.remove('hidden');
    }, 1500);
  }
}

// Génère des colonnes de caractères façon « pluie de données »
function genererPluieDonnees(conteneur) {
  conteneur.innerHTML = '';
  const colonnes = Math.floor(window.innerWidth / 16);
  const chars = '01░▒▓<>{}[]#@$%&*/\\|';
  for (let i = 0; i < colonnes; i++) {
    const col = document.createElement('div');
    col.className = 'rain-col';
    col.style.left = (i * 16) + 'px';
    col.style.animationDuration = (1.5 + Math.random() * 2.5) + 's';
    col.style.animationDelay = (Math.random() * 1.5) + 's';
    let texte = '';
    const longueur = 20 + Math.floor(Math.random() * 40);
    for (let j = 0; j < longueur; j++) {
      texte += chars[Math.floor(Math.random() * chars.length)] + '\n';
    }
    col.textContent = texte;
    conteneur.appendChild(col);
  }
}

// Relance une partie depuis zéro (après une fin)
function recommencer() {
  Save.reinitialiser(false); // pas de confirmation : le joueur a déjà choisi
}
