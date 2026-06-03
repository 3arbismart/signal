/* ============================================================
   SIGNAL — js/save.js
   Système de sauvegarde : localStorage, auto-save, export/import
   en base64, réinitialisation et horodatage en direct.
   ============================================================ */

const SAVE_KEY = 'signal_save';

// Valeurs par défaut des drapeaux d'état (pour une fusion robuste au chargement)
const FLAGS_DEFAUT = {
  phase2Unlocked: false,
  phase3Unlocked: false,
  finalChoiceShown: false,
  dernierMessage: 0
};

const Save = {

  /* --------------------------------------------------------
     Sérialisation : transforme l'état du jeu en objet simple
     -------------------------------------------------------- */
  serialiser() {
    return {
      v: GameState.version,
      phase: GameState.phase,
      resources: Object.assign({}, GameState.resources),
      totals: Object.assign({}, GameState.totals),
      moral: GameState.moral,
      clickBase: GameState.clickBase,
      timePlayed: GameState.timePlayed,
      ending: GameState.ending,
      flags: Object.assign({}, GameState.flags),
      lastSave: Date.now(),
      // On ne conserve que l'id et la quantité possédée de chaque générateur
      buildings: BUILDINGS.map(b => ({ id: b.id, owned: b.owned })),
      // On ne conserve que les id des améliorations achetées
      upgrades: UPGRADES.filter(u => u.bought).map(u => u.id)
    };
  },

  /* --------------------------------------------------------
     Désérialisation : applique un objet de sauvegarde à l'état
     -------------------------------------------------------- */
  deserialiser(data) {
    GameState.phase = data.phase || 1;
    GameState.resources = Object.assign(
      { likes: 0, opinions: 0, dependances: 0, controle: 0 },
      data.resources || {}
    );
    GameState.totals = Object.assign({ likes: 0, opinions: 0 }, data.totals || {});
    GameState.moral = (typeof data.moral === 'number') ? data.moral : 100;
    GameState.clickBase = data.clickBase || 1;
    GameState.timePlayed = data.timePlayed || 0;
    GameState.ending = data.ending || null;
    GameState.fini = !!GameState.ending; // une partie terminée reste figée
    GameState.flags = Object.assign({}, FLAGS_DEFAUT, data.flags || {});
    GameState.lastSave = data.lastSave || Date.now();

    // Générateurs possédés
    if (Array.isArray(data.buildings)) {
      data.buildings.forEach(s => {
        const b = BUILDINGS.find(x => x.id === s.id);
        if (b) b.owned = s.owned || 0;
      });
    }

    // Améliorations achetées
    UPGRADES.forEach(u => { u.bought = false; });
    if (Array.isArray(data.upgrades)) {
      data.upgrades.forEach(id => {
        const u = UPGRADES.find(x => x.id === id);
        if (u) u.bought = true;
      });
    }

    recalculerEffets();
  },

  /* --------------------------------------------------------
     Sauvegarde dans localStorage
     notifier = true pour afficher une notification (sauvegarde manuelle)
     -------------------------------------------------------- */
  sauvegarder(notifier) {
    try {
      const data = this.serialiser();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      GameState.lastSave = data.lastSave;
      this.majHorodatage();
      if (notifier) UI.notifier('Partie sauvegardée.');
    } catch (e) {
      UI.notifier('Échec de la sauvegarde : ' + e.message);
    }
  },

  /* --------------------------------------------------------
     Chargement depuis localStorage.
     Renvoie l'objet de sauvegarde (pour le calcul hors-ligne) ou null.
     -------------------------------------------------------- */
  charger() {
    const brut = localStorage.getItem(SAVE_KEY);
    if (!brut) return null;
    try {
      const data = JSON.parse(brut);
      this.deserialiser(data);
      return data;
    } catch (e) {
      UI.notifier('Sauvegarde corrompue, nouvelle partie.');
      return null;
    }
  },

  /* --------------------------------------------------------
     Export : encode l'état en base64 et le copie dans le presse-papiers
     -------------------------------------------------------- */
  exporter() {
    const json = JSON.stringify(this.serialiser());
    // encodeURIComponent + escape : permet d'encoder correctement l'UTF-8 en base64
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const champ = document.getElementById('import-field');
    if (champ) champ.value = b64; // affiché aussi dans le champ, au cas où

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(b64)
        .then(() => UI.notifier('Sauvegarde copiée dans le presse-papiers.'))
        .catch(() => UI.notifier('Copie impossible — le code est affiché dans le champ.'));
    } else {
      UI.notifier('Code de sauvegarde affiché dans le champ.');
    }
  },

  /* --------------------------------------------------------
     Import : décode une chaîne base64 et charge l'état
     -------------------------------------------------------- */
  importer(chaine) {
    if (!chaine || !chaine.trim()) {
      UI.notifier('Aucun code à importer.');
      return false;
    }
    try {
      const json = decodeURIComponent(escape(atob(chaine.trim())));
      const data = JSON.parse(json);
      this.deserialiser(data);
      GameState.lastSave = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialiser()));

      // Rafraîchissement complet de l'interface
      document.body.className = 'phase-' + GameState.phase;
      UI.appliquerPhaseUI();
      UI.rendreBatiments();
      UI.rendreAmeliorations();
      if (GameState.ending) afficherEnding(GameState.ending); // reprise d'une partie finie
      UI.notifier('Sauvegarde importée avec succès.');
      return true;
    } catch (e) {
      UI.notifier('Code de sauvegarde invalide.');
      return false;
    }
  },

  /* --------------------------------------------------------
     Réinitialisation : efface la sauvegarde et recharge le jeu
     confirmer = true pour demander une confirmation au joueur
     -------------------------------------------------------- */
  reinitialiser(confirmer) {
    if (confirmer && !window.confirm(
      'Tout effacer et recommencer depuis zéro ? Cette action est irréversible.'
    )) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  },

  /* --------------------------------------------------------
     Démarre l'auto-save (toutes les 30 secondes)
     -------------------------------------------------------- */
  demarrerAutoSave() {
    setInterval(() => this.sauvegarder(false), 30000);
  },

  /* --------------------------------------------------------
     Met à jour le texte « Dernière sauvegarde : il y a X secondes »
     -------------------------------------------------------- */
  majHorodatage() {
    const el = document.getElementById('last-save');
    if (!el) return;
    const secondes = Math.max(0, Math.floor((Date.now() - GameState.lastSave) / 1000));
    let texte;
    if (secondes < 1) texte = 'à l\'instant';
    else if (secondes < 60) texte = 'il y a ' + secondes + ' s';
    else {
      const min = Math.floor(secondes / 60);
      texte = 'il y a ' + min + ' min ' + (secondes % 60) + ' s';
    }
    el.textContent = 'Dernière sauvegarde : ' + texte;
  },

  // Rafraîchit l'horodatage chaque seconde
  demarrerHorodatage() {
    setInterval(() => this.majHorodatage(), 1000);
  }
};
