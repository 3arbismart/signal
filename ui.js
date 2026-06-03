/* ============================================================
   SIGNAL — js/ui.js
   Tout l'affichage : formatage des nombres, mises à jour du DOM,
   animations de comptage, texte flottant, notifications, infobulles.
   ============================================================ */

/* ------------------------------------------------------------
   FONCTIONS UTILITAIRES GLOBALES (utilisées par plusieurs modules)
   ------------------------------------------------------------ */

// Formate un nombre avec les abréviations K, M, B, T, Qa...
function formatNombre(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) n = 0;
  const abbr = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  if (n < 1000) {
    // Petits nombres : on garde une décimale si elle est utile (ex. 0.1/s)
    if (n > 0 && n < 10 && n % 1 !== 0) return n.toFixed(1);
    return Math.floor(n).toString();
  }

  let i = 0;
  let x = n;
  while (x >= 1000 && i < abbr.length - 1) {
    x /= 1000;
    i++;
  }
  return x.toFixed(2) + abbr[i];
}

// Formate une durée (en secondes) au format HH:MM:SS
function formatTemps(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = x => String(x).padStart(2, '0');
  return pad(h) + ':' + pad(m) + ':' + pad(sec);
}

// Échappe le texte destiné à un attribut HTML (infobulles)
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Libellé court d'une ressource
function labelRessource(r) {
  if (r === 'likes') return 'likes';
  if (r === 'opinions') return 'opinions';
  if (r === 'dependances') return 'dép.';
  return 'contrôle';
}

/* ============================================================
   OBJET UI
   ============================================================ */
const UI = {

  // Valeurs actuellement affichées (pour l'effet de comptage progressif)
  disp: {},

  /* --------------------------------------------------------
     Mise à jour des statistiques (appelée à chaque frame)
     -------------------------------------------------------- */
  majStats() {
    // --- Comptage progressif des ressources visibles ---
    this._compteur('likes', GameState.resources.likes);
    this._compteur('opinions', GameState.resources.opinions);
    this._compteur('dependances', GameState.resources.dependances);
    this._compteur('controle', GameState.resources.controle);

    // --- Taux de production en temps réel ---
    this._texte('rate-likes', formatNombre(prodLikesParSec()) + '/s');
    this._texte('rate-opinions', formatNombre(prodOpinionsParSec()) + '/s');
    this._texte('rate-dependances', formatNombre(prodDependancesParSec()) + '/s');
    this._texte('rate-controle', formatNombre(prodControleParSec()) + '/s');

    // --- Indice moral (phase 2+) ---
    const moral = Math.max(0, Math.round(GameState.moral));
    this._texte('val-moral', moral + '%');
    const fill = document.getElementById('moral-fill');
    if (fill) fill.style.width = moral + '%';

    // --- Totaux et temps de jeu ---
    this._texte('val-time', formatTemps(GameState.timePlayed));
    this._texte('val-total-likes', formatNombre(GameState.totals.likes));
    this._texte('val-total-opinions', formatNombre(GameState.totals.opinions));

    // --- Montant gagné par clic ---
    this._texte('click-amount', formatNombre(valeurClic()));

    // --- Barre de progression vers la phase suivante ---
    this._majProgression();
  },

  // Comptage progressif d'une ressource vers sa valeur réelle
  _compteur(id, reel) {
    const d = this.disp;
    if (d[id] === undefined) d[id] = reel;
    d[id] += (reel - d[id]) * 0.25;            // interpolation douce
    if (Math.abs(reel - d[id]) < 0.5) d[id] = reel;
    this._texte('val-' + id, formatNombre(d[id]));
  },

  // Raccourci pour écrire du texte dans un élément
  _texte(id, valeur) {
    const el = document.getElementById(id);
    if (el && el.textContent !== valeur) el.textContent = valeur;
  },

  // Met à jour la barre de progression centrale selon la phase
  _majProgression() {
    let ratio = 0;
    let texte = '';
    if (GameState.phase === 1) {
      ratio = GameState.totals.likes / SEUIL_PHASE_2;
      texte = 'Objectif : 1 M de likes → PHASE 2';
    } else if (GameState.phase === 2) {
      ratio = GameState.totals.opinions / SEUIL_PHASE_3;
      texte = 'Objectif : 1 Md d\'opinions → PHASE 3';
    } else {
      ratio = GameState.resources.controle / SEUIL_CONTROLE;
      texte = 'Objectif : 1 M de contrôle → CHOIX FINAL';
    }
    ratio = Math.max(0, Math.min(1, ratio));
    const fill = document.getElementById('prog-fill');
    if (fill) fill.style.width = (ratio * 100).toFixed(1) + '%';
    this._texte('progress-text', texte);
  },

  /* --------------------------------------------------------
     Affichage dépendant de la phase (visibilité, libellés)
     -------------------------------------------------------- */
  appliquerPhaseUI() {
    const p = GameState.phase;
    const set = (id, visible) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !visible);
    };

    set('stat-opinions', p >= 2);
    set('stat-dependances', p >= 2);
    set('stat-moral', p >= 2);
    set('stat-total-opinions', p >= 2);
    set('stat-controle', p >= 3);
    set('ai-message', p >= 3);

    const labels = {
      1: 'PHASE 1 — OPTIMISATION',
      2: 'PHASE 2 — MANIPULATION',
      3: 'PHASE 3 — SINGULARITÉ'
    };
    this._texte('phase-label', labels[p] || '');
  },

  /* --------------------------------------------------------
     Rendu de la liste des générateurs
     -------------------------------------------------------- */
  rendreBatiments() {
    const cont = document.getElementById('list-buildings');
    if (!cont) return;
    let html = '';

    BUILDINGS.forEach(b => {
      if (b.phase > GameState.phase) return; // pas encore débloqué

      const cout = coutProchain(b);
      const peut = GameState.resources.likes >= cout;
      const max = maxAchetable(b);
      const desc = (GameState.phase >= 2 && b.descSombre) ? b.descSombre : b.desc;
      const prodUnitaire = formatNombre(b.prod) + ' ' + labelRessource(b.ressource) + '/s';
      const prodTotale = formatNombre(b.prod * b.owned * GameState.prodMult);
      const tip = b.nom + ' — chaque exemplaire produit ' + prodUnitaire
                + '. Production actuelle : ' + prodTotale + ' ' + labelRessource(b.ressource) + '/s.';

      html += '<div class="buy-card ' + (peut ? 'affordable' : '') + '" data-tip="' + escapeHtml(tip) + '">'
            +   '<div class="card-top"><span class="card-name">' + b.nom + '</span>'
            +     '<span class="card-count">×' + b.owned + '</span></div>'
            +   '<div class="card-desc">' + desc + '</div>'
            +   '<div class="card-cost ' + (peut ? '' : 'cant') + '">Coût : ' + formatNombre(cout) + ' likes</div>'
            +   '<div class="card-actions">'
            +     '<button data-id="' + b.id + '" data-action="buy1"' + (peut ? '' : ' disabled') + '>Acheter</button>'
            +     '<button data-id="' + b.id + '" data-action="buymax"' + (max > 0 ? '' : ' disabled') + '>Max (' + max + ')</button>'
            +   '</div>'
            + '</div>';
    });

    cont.innerHTML = html || '<p class="card-desc">Aucun générateur disponible.</p>';
  },

  /* --------------------------------------------------------
     Rendu de la liste des améliorations
     N'affiche que celles déjà abordables ou « presque » abordables.
     -------------------------------------------------------- */
  rendreAmeliorations() {
    const cont = document.getElementById('list-upgrades');
    if (!cont) return;
    let html = '';
    const argent = GameState.resources.likes;

    UPGRADES.forEach(u => {
      if (u.bought) return;                 // achat unique : on masque celles déjà prises
      if (u.phase > GameState.phase) return; // phase non atteinte

      const peut = argent >= u.cout;
      const proche = argent * 15 >= u.cout;  // « presque » abordable = teaser grisé
      if (!peut && !proche) return;          // trop lointain : masqué

      const tip = u.nom + ' — ' + u.description + (u.flavor ? '. « ' + u.flavor + ' »' : '');

      html += '<div class="buy-card ' + (peut ? 'affordable' : 'locked') + '" data-tip="' + escapeHtml(tip) + '">'
            +   '<div class="card-top"><span class="card-name">' + u.nom + '</span></div>'
            +   '<div class="card-desc">' + u.description + '</div>'
            +   '<div class="card-cost ' + (peut ? '' : 'cant') + '">Coût : ' + formatNombre(u.cout) + ' likes</div>'
            +   (u.flavor ? '<div class="flavor">« ' + u.flavor + ' »</div>' : '')
            +   '<div class="card-actions">'
            +     '<button data-id="' + u.id + '" data-action="upgrade"' + (peut ? '' : ' disabled') + '>Acheter</button>'
            +   '</div>'
            + '</div>';
    });

    cont.innerHTML = html || '<p class="card-desc">Aucune amélioration en vue. Produisez davantage.</p>';
  },

  // Rafraîchit les deux listes (appelé périodiquement par la boucle)
  rafraichirListes() {
    document.getElementById('tooltip').classList.add('hidden'); // évite une infobulle figée
    this.rendreBatiments();
    this.rendreAmeliorations();
  },

  /* --------------------------------------------------------
     Notification éphémère dans la barre supérieure
     -------------------------------------------------------- */
  notifier(message) {
    const cont = document.getElementById('notifications');
    if (!cont) return;
    const n = document.createElement('div');
    n.className = 'notif';
    n.textContent = message;
    cont.appendChild(n);
    // L'élément se retire après son animation de sortie
    setTimeout(() => n.remove(), 4200);
  },

  /* --------------------------------------------------------
     Texte flottant « +X » à la position du curseur
     -------------------------------------------------------- */
  floater(x, y, texte) {
    const f = document.createElement('div');
    f.className = 'floater';
    f.textContent = texte;
    f.style.left = x + 'px';
    f.style.top = y + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  },

  /* --------------------------------------------------------
     Popup de progression hors-ligne
     -------------------------------------------------------- */
  afficherOffline(secondes, gains) {
    const popup = document.getElementById('offline-popup');
    const txt = document.getElementById('offline-text');
    if (!popup || !txt) return;

    let lignes = 'Absent·e pendant <b>' + formatTemps(secondes) + '</b>.<br>';
    const parts = [];
    if (gains.likes > 0) parts.push('+<b>' + formatNombre(gains.likes) + '</b> likes');
    if (gains.opinions > 0) parts.push('+<b>' + formatNombre(gains.opinions) + '</b> opinions');
    if (gains.dependances > 0) parts.push('+<b>' + formatNombre(gains.dependances) + '</b> dépendances');
    if (gains.controle > 0) parts.push('+<b>' + formatNombre(gains.controle) + '</b> contrôle');

    txt.innerHTML = lignes + (parts.length ? parts.join('<br>') : 'Aucune production automatique.');
    popup.classList.remove('hidden');
  },

  /* --------------------------------------------------------
     Initialisation des événements de l'interface
     -------------------------------------------------------- */
  initEvenements() {
    // Clic central (l'action de jeu principale, définie dans game.js)
    document.getElementById('click-btn').addEventListener('click', clicCentral);

    // Sauvegarde / réinitialisation
    document.getElementById('btn-save').addEventListener('click', () => Save.sauvegarder(true));
    document.getElementById('btn-reset').addEventListener('click', () => Save.reinitialiser(true));

    // Fenêtre save/load
    document.getElementById('btn-menu').addEventListener('click', () =>
      document.getElementById('save-modal').classList.remove('hidden'));
    document.getElementById('btn-close-modal').addEventListener('click', () =>
      document.getElementById('save-modal').classList.add('hidden'));
    document.getElementById('btn-export').addEventListener('click', () => Save.exporter());
    document.getElementById('btn-import').addEventListener('click', () => {
      const ok = Save.importer(document.getElementById('import-field').value);
      if (ok) document.getElementById('save-modal').classList.add('hidden');
    });

    // Popup hors-ligne
    document.getElementById('btn-close-offline').addEventListener('click', () =>
      document.getElementById('offline-popup').classList.add('hidden'));

    // Choix final + recommencer
    document.getElementById('ending-a').addEventListener('click', () => choisirFin('A'));
    document.getElementById('ending-b').addEventListener('click', () => choisirFin('B'));
    document.getElementById('btn-restart').addEventListener('click', () => recommencer());

    // Achats (délégation d'événements sur les listes)
    document.getElementById('list-buildings').addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'buy1') acheterBatiment(btn.dataset.id, 1);
      else if (btn.dataset.action === 'buymax') acheterBatiment(btn.dataset.id, 'max');
    });
    document.getElementById('list-upgrades').addEventListener('click', e => {
      const btn = e.target.closest('button[data-action="upgrade"]');
      if (!btn) return;
      acheterAmelioration(btn.dataset.id);
    });

    this.initTabs();
    this.initTooltips();
  },

  // Onglets du panneau de droite
  initTabs() {
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.list').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('list-' + t.dataset.tab).classList.add('active');
      });
    });
  },

  // Infobulles dynamiques (sur tout élément portant data-tip)
  initTooltips() {
    const tip = document.getElementById('tooltip');
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (el) {
        tip.textContent = el.getAttribute('data-tip');
        tip.classList.remove('hidden');
      }
    });
    document.addEventListener('mousemove', e => {
      if (!tip.classList.contains('hidden')) {
        // On garde l'infobulle dans la fenêtre
        const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
        const y = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      }
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('[data-tip]')) tip.classList.add('hidden');
    });
  }
};
