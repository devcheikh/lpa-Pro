// --- ÉTAT GLOBAL ---
let currentSession = null;
let currentRole = null; // null | { type: 'admin' } | { type: 'equipe', equipe }
let allEquipes = [];
let currentMatchId = null;
let currentMatch = null;

let chronoInterval;
let seconds = 0;
let isRunning = false;
let matchDuration = 90;

// --- HELPERS ---
function nameForEquipe(equipeId) {
    const eq = allEquipes.find((e) => e.id === equipeId);
    return eq ? eq.nom : '—';
}

async function refreshEquipesCache() {
    try {
        allEquipes = await fetchAllEquipes();
    } catch (e) {
        notifyError('Erreur chargement des équipes', e);
    }
}

// --- NAVIGATION ---
function renderNav() {
    const tabs = [
        { id: 'view-live', icon: 'fa-broadcast-tower', label: 'Multiplex' },
        { id: 'view-lineup', icon: 'fa-list-ol', label: 'Composition' },
        { id: 'view-history', icon: 'fa-history', label: 'Historique' }
    ];

    if (!currentRole) {
        tabs.push({ id: 'view-auth', icon: 'fa-sign-in-alt', label: 'Connexion' });
    } else if (currentRole.type === 'equipe') {
        tabs.push({ id: 'view-team', icon: 'fa-users-cog', label: 'Mon Équipe' });
    } else if (currentRole.type === 'admin') {
        tabs.push({ id: 'view-organisateur', icon: 'fa-crown', label: 'Organisateur' });
        tabs.push({ id: 'view-admin', icon: 'fa-satellite-dish', label: 'Direct' });
    }

    const tabsHtml = tabs.map((t) => `<a href="#" data-view="${t.id}" title="${escapeHtml(t.label)}"><i class="fa ${t.icon}"></i></a>`).join('');
    const logoutHtml = currentRole ? '<a href="#" id="logoutTab" title="Déconnexion"><i class="fa fa-sign-out-alt"></i></a>' : '';

    document.getElementById('navTabs').innerHTML = tabsHtml + logoutHtml;

    document.querySelectorAll('#navTabs a[data-view]').forEach((a) => {
        a.classList.toggle('active', document.getElementById(a.dataset.view)?.style.display === 'block');
    });
}

function showView(viewId) {
    document.querySelectorAll('#app > div').forEach((div) => { div.style.display = 'none'; });
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.style.display = 'block';

    document.querySelectorAll('#navTabs a[data-view]').forEach((a) => {
        a.classList.toggle('active', a.dataset.view === viewId);
    });

    if (viewId === 'view-live') loadLiveMatches();
    else if (viewId === 'view-lineup') loadLineupView();
    else if (viewId === 'view-history') loadHistoryView();
    else if (viewId === 'view-team') loadTeamSpace();
    else if (viewId === 'view-organisateur') loadOrganisateurSpace();
    else if (viewId === 'view-admin') loadDirectView();
    else if (viewId === 'view-auth') showAuthTab('login');
}

function showAuthTab(tab) {
    document.getElementById('authTabLogin').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('authTabSignup').style.display = tab === 'signup' ? 'block' : 'none';
    document.querySelectorAll('.auth-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.id === tab);
    });
}

// --- CHRONO ---
function startChronoInterval() {
    if (isRunning) return;
    isRunning = true;
    const btn = document.querySelector('.admin-controls .green i');
    if (btn) btn.className = 'fa fa-pause';
    chronoInterval = setInterval(() => {
        seconds++;
        updateChronoDisplay();
        checkMatchEnd();
        if (seconds % 5 === 0) syncMatchScoreFromDom();
    }, 1000);
}

function stopChronoInterval() {
    isRunning = false;
    clearInterval(chronoInterval);
    const btn = document.querySelector('.admin-controls .green i');
    if (btn) btn.className = 'fa fa-play';
}

function toggleChrono() {
    if (!isRunning) {
        startChronoInterval();
        logEvent('Match', 'Le chrono a démarré', 'fa-clock', 'INFO');
    } else {
        stopChronoInterval();
        syncMatchScoreFromDom();
        logEvent('Match', 'Le chrono est arrêté', 'fa-clock', 'INFO');
    }
}

function resetChrono() {
    stopChronoInterval();
    seconds = 0;
    updateChronoDisplay();
    syncMatchScoreFromDom();
    logEvent('Match', 'Chrono réinitialisé', 'fa-undo', 'INFO');
}

function updateChronoDisplay() {
    document.getElementById('chronoDisplay').innerText = formatChrono(seconds);
}

function checkMatchEnd() {
    if (isRunning && seconds >= matchDuration * 60) {
        stopChronoInterval();
        syncMatchScoreFromDom();
        logEvent('Match', 'Fin du temps réglementaire', 'fa-flag-checkered', 'INFO');
        Swal.fire({ title: 'Fin du match', text: `Temps réglementaire (${matchDuration} min) écoulé.`, icon: 'info' });
    }
}

// --- AUTHENTIFICATION ---
async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
        await signIn(formData.get('email'), formData.get('password'));
        e.target.reset();
        Swal.fire('Connecté', 'Bienvenue !', 'success');
    } catch (err) {
        notifyError('Erreur de connexion', err);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
        const result = await signUpEquipe(formData.get('email'), formData.get('password'), formData.get('nomEquipe'));
        e.target.reset();
        if (result.session) {
            Swal.fire('Compte créé', "Votre équipe est en attente de validation par l'organisateur.", 'success');
        } else {
            Swal.fire('Compte créé', 'Vérifiez votre email pour confirmer votre compte, puis connectez-vous.', 'info');
        }
    } catch (err) {
        notifyError('Erreur inscription équipe', err);
    }
}

async function handleLogout() {
    try {
        await signOut();
        currentMatchId = null;
        currentMatch = null;
        showView('view-live');
    } catch (err) {
        notifyError('Erreur déconnexion', err);
    }
}

// --- MON ÉQUIPE ---
async function loadTeamSpace() {
    if (!currentRole || currentRole.type !== 'equipe') {
        showView('view-auth');
        return;
    }
    const equipe = currentRole.equipe;
    document.getElementById('teamStatusLabel').textContent =
        `${equipe.nom} — ${equipe.statut === 'validee' ? 'Compte validé' : "En attente de validation par l'organisateur"}`;

    try {
        const [roster, matches] = await Promise.all([fetchRoster(equipe.id), fetchMatchsEquipe(equipe.id)]);

        const nextMatch = matches
            .filter((m) => m.statut === 'a_venir')
            .sort((a, b) => new Date(a.date_heure || a.created_at) - new Date(b.date_heure || b.created_at))[0] || null;

        let nextMatchComposition = {};
        if (nextMatch) {
            try {
                const composition = await fetchComposition(nextMatch.id);
                composition.forEach((c) => { nextMatchComposition[c.joueur_id] = c.statut; });
            } catch (e) {
                notifyError('Erreur chargement de la composition', e);
            }
        }

        renderRoster(roster, equipe.id, nextMatch, nextMatchComposition);
        await renderTeamMatches(equipe, matches, roster);
    } catch (e) {
        notifyError('Erreur chargement de votre espace équipe', e);
    }
}

const COMPOSITION_STATUS_LABELS = { Titulaire: 'Titulaire', Remplacant: 'Remplaçant', 'Non convoque': 'Non convoqué' };
const COMPOSITION_STATUS_BADGE_CLASS = { Titulaire: 'titulaire', Remplacant: 'remplacant', 'Non convoque': 'info' };

function renderRoster(roster, equipeId, nextMatch, compByJoueur) {
    const container = document.getElementById('rosterList');
    if (!roster.length) {
        container.innerHTML = '<div class="timeline-empty">Aucun joueur dans l\'effectif.</div>';
        return;
    }

    const banner = nextMatch
        ? `<div class="timeline-empty" style="grid-column: 1 / -1;">Statut affiché pour le prochain match vs ${escapeHtml(nameForEquipe(nextMatch.equipe_a_id === equipeId ? nextMatch.equipe_b_id : nextMatch.equipe_a_id))}</div>`
        : '<div class="timeline-empty" style="grid-column: 1 / -1;">Aucun match à venir pour afficher un statut.</div>';

    const cards = roster.map((p) => {
        const statut = compByJoueur[p.id] || 'Non convoque';
        return `
        <div class="player-card">
            <div class="status-badge ${COMPOSITION_STATUS_BADGE_CLASS[statut]}" style="position: static; display: inline-block; margin: 10px 0 0 10px;">${escapeHtml(COMPOSITION_STATUS_LABELS[statut])}</div>
            <div class="player-info">
                <span class="player-name">#${p.numero} ${escapeHtml(p.nom_prenom)}</span>
            </div>
            <div class="action-overlay">
                <button class="btn-action" data-action="delete-roster" data-id="${p.id}"><i class="fa fa-trash red-text"></i></button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = banner + cards;
}

async function renderTeamMatches(equipe, matches, roster) {
    const container = document.getElementById('teamMatchesList');
    if (!matches.length) {
        container.innerHTML = '<div class="timeline-empty">Aucun match programmé.</div>';
        return;
    }

    const blocks = await Promise.all(matches.map(async (m) => {
        const opponentId = m.equipe_a_id === equipe.id ? m.equipe_b_id : m.equipe_a_id;
        const locked = m.statut !== 'a_venir';

        let composition = [];
        try {
            composition = await fetchComposition(m.id);
        } catch (e) {
            notifyError('Erreur chargement de la composition', e);
        }
        const compByJoueur = {};
        composition.forEach((c) => { compByJoueur[c.joueur_id] = c; });

        const rows = roster.map((p) => {
            const current = compByJoueur[p.id]?.statut || 'Non convoque';
            const options = [
                { value: 'Non convoque', label: 'Non convoqué' },
                { value: 'Titulaire', label: 'Titulaire' },
                { value: 'Remplacant', label: 'Remplaçant' }
            ].map((o) => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`).join('');

            return `
            <div class="lineup-item">
                <span class="player-num">${p.numero}</span>
                <span class="player-name-small" style="flex:1">${escapeHtml(p.nom_prenom)}</span>
                <select class="browser-default composition-select" style="width: 150px; height: 36px !important;" data-match-id="${m.id}" data-joueur-id="${p.id}" data-equipe-id="${equipe.id}" ${locked ? 'disabled' : ''}>
                    ${options}
                </select>
            </div>`;
        }).join('');

        const summary = renderCompositionSummary(roster, compByJoueur);
        const validateBtn = (!locked && roster.length)
            ? `<button class="btn btn-submit" data-action="valider-composition" data-id="${m.id}" data-team="${equipe.id}" style="margin-top: 15px;"><i class="fa fa-check"></i> VALIDER LA COMPOSITION</button>`
            : '';

        return `
        <div class="match-setup-box">
            <h6>vs ${escapeHtml(nameForEquipe(opponentId))} <span class="status-badge info" style="position:static;">${escapeHtml(m.statut)}</span></h6>
            ${rows || '<div class="timeline-empty">Ajoutez des joueurs à votre effectif pour composer votre équipe.</div>'}
            ${validateBtn}
            ${roster.length ? summary : ''}
        </div>`;
    }));

    container.innerHTML = blocks.join('');
}

function renderCompositionSummary(roster, compByJoueur) {
    const groups = { Titulaire: [], Remplacant: [], 'Non convoque': [] };
    roster.forEach((p) => {
        const statut = compByJoueur[p.id]?.statut || 'Non convoque';
        groups[statut].push(p);
    });

    const renderGroup = (players) => players.length
        ? players.map((p) => `
            <div class="lineup-item">
                <span class="player-num">${p.numero}</span>
                <span class="player-name-small">${escapeHtml(p.nom_prenom)}</span>
            </div>`).join('')
        : '<div class="timeline-empty">Aucun</div>';

    return `
        <div class="lineup-section">
            <small>TITULAIRES (${groups.Titulaire.length})</small>
            ${renderGroup(groups.Titulaire)}
        </div>
        <div class="lineup-section">
            <small>REMPLAÇANTS (${groups.Remplacant.length})</small>
            ${renderGroup(groups.Remplacant)}
        </div>
        <div class="lineup-section">
            <small>NON CONVOQUÉS (${groups['Non convoque'].length})</small>
            ${renderGroup(groups['Non convoque'])}
        </div>`;
}

async function handleAddPlayer(e) {
    e.preventDefault();
    if (!currentRole || currentRole.type !== 'equipe') return;
    const formData = new FormData(e.target);
    try {
        await insertJoueurRoster(currentRole.equipe.id, formData.get('nomPrenom'), parseInt(formData.get('numero'), 10), null);
        e.target.reset();
        loadTeamSpace();
    } catch (err) {
        notifyError('Erreur ajout du joueur', err);
    }
}

// --- ORGANISATEUR ---
async function loadOrganisateurSpace() {
    if (!currentRole || currentRole.type !== 'admin') {
        showView('view-auth');
        return;
    }
    try {
        const [pending, matches] = await Promise.all([fetchEquipesEnAttente(), fetchMatchsAll()]);
        await refreshEquipesCache();
        renderPendingTeams(pending);
        renderMatchCreationSelects(allEquipes.filter((e) => e.statut === 'validee'));
        renderAllMatchsList(matches);
    } catch (e) {
        notifyError('Erreur chargement espace organisateur', e);
    }
}

function renderPendingTeams(pending) {
    const container = document.getElementById('pendingTeamsList');
    if (!pending.length) {
        container.innerHTML = '<div class="timeline-empty">Aucune équipe en attente.</div>';
        return;
    }
    container.innerHTML = pending.map((eq) => `
        <div class="lineup-item">
            <span class="player-name-small" style="flex:1">${escapeHtml(eq.nom)}</span>
            <button class="btn btn-small green" data-action="valider-equipe" data-id="${eq.id}">Valider</button>
        </div>`).join('');
}

function renderMatchCreationSelects(validTeams) {
    const optionsHtml = validTeams.map((eq) => `<option value="${eq.id}">${escapeHtml(eq.nom)}</option>`).join('');
    document.getElementById('createMatchEquipeA').innerHTML = `<option value="">Choisir Équipe A</option>${optionsHtml}`;
    document.getElementById('createMatchEquipeB').innerHTML = `<option value="">Choisir Équipe B</option>${optionsHtml}`;
}

function renderAllMatchsList(matches) {
    const container = document.getElementById('allMatchsList');
    if (!matches.length) {
        container.innerHTML = '<div class="timeline-empty">Aucun match créé.</div>';
        return;
    }
    container.innerHTML = matches.map((m) => `
        <div class="lineup-item">
            <span class="player-name-small" style="flex:1">${escapeHtml(nameForEquipe(m.equipe_a_id))} vs ${escapeHtml(nameForEquipe(m.equipe_b_id))} — ${m.score_a}:${m.score_b} (${escapeHtml(m.statut)})</span>
            <button class="btn btn-small blue" data-action="piloter-match" data-id="${m.id}">Piloter</button>
        </div>`).join('');
}

async function handleCreateMatch(e) {
    e.preventDefault();
    const equipeA = document.getElementById('createMatchEquipeA').value;
    const equipeB = document.getElementById('createMatchEquipeB').value;
    const dateHeure = new FormData(e.target).get('dateHeure');

    if (!equipeA || !equipeB || equipeA === equipeB) {
        Swal.fire('Erreur', 'Choisissez deux équipes différentes.', 'error');
        return;
    }

    try {
        await creerMatch(equipeA, equipeB, dateHeure ? new Date(dateHeure).toISOString() : null);
        Swal.fire('Match créé', '', 'success');
        e.target.reset();
        loadOrganisateurSpace();
    } catch (err) {
        notifyError('Erreur création du match', err);
    }
}

// --- SÉLECTION DE MATCH (spectateur ou organisateur) ---
async function selectMatch(matchId) {
    currentMatchId = matchId;
    subscribeToMatch(matchId);
    try {
        currentMatch = await fetchMatchById(matchId);
        applyMatchHeader(currentMatch);
    } catch (e) {
        notifyError('Erreur chargement du match', e);
    }
}

function applyMatchHeader(match) {
    document.getElementById('displayNameA').innerText = nameForEquipe(match.equipe_a_id);
    document.getElementById('displayNameB').innerText = nameForEquipe(match.equipe_b_id);
    document.getElementById('scoreA').innerText = match.score_a;
    document.getElementById('scoreB').innerText = match.score_b;
    document.getElementById('chronoDisplay').innerText = match.temps;
    seconds = parseChronoToSeconds(match.temps);
}

// --- MULTIPLEX (SPECTATEUR) ---
async function loadLiveMatches() {
    const grid = document.getElementById('live-matches-grid');
    try {
        const data = await fetchLiveMatches();
        if (!data.length) {
            grid.innerHTML = '<div class="timeline-empty">Aucun match en cours.</div>';
            return;
        }

        grid.innerHTML = data.map((m) => `
            <div class="live-match-card" data-action="select-match" data-id="${m.id}" style="cursor:pointer;">
                <div class="live-badge">DIRECT</div>
                <div class="match-teams">
                    <div class="team-mini">
                        <span>${escapeHtml(nameForEquipe(m.equipe_a_id))}</span>
                        <span class="score-mini">${m.score_a}</span>
                    </div>
                    <div class="vs-mini">-</div>
                    <div class="team-mini">
                        <span class="score-mini">${m.score_b}</span>
                        <span>${escapeHtml(nameForEquipe(m.equipe_b_id))}</span>
                    </div>
                </div>
                <div class="match-footer">
                    <span class="chrono-mini">${escapeHtml(m.temps)}</span>
                </div>
            </div>`).join('');
    } catch (e) {
        notifyError('Erreur chargement des matchs en direct', e);
    }
}

// --- COMPOSITION (SPECTATEUR) ---
async function loadLineupView() {
    const empty = document.getElementById('lineupEmpty');
    const content = document.getElementById('lineupContent');

    if (!currentMatchId) {
        empty.style.display = 'block';
        content.style.display = 'none';
        return;
    }
    empty.style.display = 'none';
    content.style.display = '';

    try {
        currentMatch = (currentMatch && currentMatch.id === currentMatchId) ? currentMatch : await fetchMatchById(currentMatchId);
        document.querySelector('#teamA-list .team-a-title').textContent = nameForEquipe(currentMatch.equipe_a_id);
        document.querySelector('#teamB-list .team-b-title').textContent = nameForEquipe(currentMatch.equipe_b_id);

        const composition = await fetchComposition(currentMatchId);
        displayLineups(composition, currentMatch);
    } catch (e) {
        notifyError('Erreur chargement de la composition', e);
    }
}

function displayLineups(composition, match) {
    const sections = {
        'A-Titulaire': document.querySelector('#teamA-list .list-starters'),
        'A-Remplacant': document.querySelector('#teamA-list .list-subs'),
        'B-Titulaire': document.querySelector('#teamB-list .list-starters'),
        'B-Remplacant': document.querySelector('#teamB-list .list-subs')
    };
    const buckets = { 'A-Titulaire': [], 'A-Remplacant': [], 'B-Titulaire': [], 'B-Remplacant': [] };

    composition.forEach((c) => {
        if (c.statut === 'Non convoque') return;
        const side = c.equipe_id === match.equipe_a_id ? 'A' : (c.equipe_id === match.equipe_b_id ? 'B' : null);
        const key = `${side}-${c.statut}`;
        if (!side || !buckets[key]) return;

        const p = c.joueurs || {};
        buckets[key].push(`
            <div class="lineup-item ${c.est_sorti ? 'player-out' : ''}">
                <span class="player-num">${p.numero}</span>
                <span class="player-name-small">${escapeHtml(p.nom_prenom)}</span>
                ${c.est_sorti ? '<i class="fa fa-arrow-down red-text" style="font-size:0.6rem"></i>' : ''}
            </div>`);
    });

    Object.entries(sections).forEach(([key, el]) => {
        if (el) el.innerHTML = buckets[key].join('');
    });
}

// --- DIRECT (ADMIN) ---
async function loadDirectView() {
    if (!currentRole || currentRole.type !== 'admin') {
        showView('view-auth');
        return;
    }
    const info = document.getElementById('adminMatchInfo');

    if (!currentMatchId) {
        info.innerHTML = "Sélectionnez un match depuis l'espace Organisateur.";
        document.getElementById('admin-teamA').innerHTML = '';
        document.getElementById('admin-teamB').innerHTML = '';
        return;
    }

    try {
        currentMatch = await fetchMatchById(currentMatchId);
        applyMatchHeader(currentMatch);

        const startBtn = currentMatch.statut === 'a_venir'
            ? `<button class="btn btn-small green" data-action="demarrer-match" data-id="${currentMatch.id}" style="margin-top:10px;">Démarrer le match</button>`
            : '';
        const revertBtn = currentMatch.statut === 'en_cours'
            ? `<button class="btn btn-small grey" data-action="revert-match" data-id="${currentMatch.id}" style="margin-top:10px;"><i class="fa fa-undo"></i> Repasser à "à venir" (déverrouille la composition)</button>`
            : '';
        info.innerHTML = `${escapeHtml(nameForEquipe(currentMatch.equipe_a_id))} vs ${escapeHtml(nameForEquipe(currentMatch.equipe_b_id))} — ${escapeHtml(currentMatch.statut)}<br>${startBtn}${revertBtn}`;

        if (currentMatch.statut === 'en_cours') {
            startChronoInterval();
        }

        await loadDirectSquads();
    } catch (e) {
        notifyError('Erreur chargement du match piloté', e);
    }
}

function renderCompositionCard(c) {
    const p = c.joueurs || {};
    const isOutStyle = c.est_sorti ? 'opacity: 0.5; filter: grayscale(1);' : '';
    const subButton = c.statut === 'Titulaire' && !c.est_sorti
        ? `<button class="btn-action btn-sub" data-action="sub" data-id="${c.id}" data-team="${c.equipe_id}" data-name="${escapeHtml(p.nom_prenom)}"><i class="fa fa-exchange-alt"></i></button>`
        : '';

    return `
    <div class="player-card" style="${isOutStyle}">
        <div class="status-badge ${escapeHtml(c.statut.toLowerCase())}">${escapeHtml(c.statut)}</div>
        <img src="${escapeHtml(p.photo_url || 'https://via.placeholder.com/150')}" class="player-img">
        <div class="player-info">
            <span class="player-name">#${p.numero} ${escapeHtml(p.nom_prenom)}</span>
            ${c.est_sorti ? '<span class="player-team">(SORTI)</span>' : ''}
        </div>
        <div class="action-overlay">
            <button class="btn-action btn-goal" data-action="goal" data-id="${c.id}" data-name="${escapeHtml(p.nom_prenom)}"><i class="fa fa-futbol"></i></button>
            <button class="btn-action btn-yellow" data-action="yellow" data-id="${c.id}" data-name="${escapeHtml(p.nom_prenom)}"><i class="fa fa-square"></i></button>
            ${subButton}
        </div>
    </div>`;
}

async function loadDirectSquads() {
    if (!currentMatchId || !currentMatch) return;
    try {
        const composition = await fetchComposition(currentMatchId);
        const cardsA = [];
        const cardsB = [];

        composition.forEach((c) => {
            if (c.statut === 'Non convoque') return;
            const card = renderCompositionCard(c);
            if (c.equipe_id === currentMatch.equipe_a_id) cardsA.push(card);
            else if (c.equipe_id === currentMatch.equipe_b_id) cardsB.push(card);
        });

        document.getElementById('admin-teamA').innerHTML = cardsA.join('') || '<div class="timeline-empty">Aucun joueur convoqué.</div>';
        document.getElementById('admin-teamB').innerHTML = cardsB.join('') || '<div class="timeline-empty">Aucun joueur convoqué.</div>';

        updateScoreFromComposition(composition);
    } catch (e) {
        notifyError('Erreur chargement des compositions', e);
    }
}

function updateScoreFromComposition(composition) {
    let scoreA = 0;
    let scoreB = 0;
    composition.forEach((c) => {
        if (c.equipe_id === currentMatch.equipe_a_id) scoreA += c.buts || 0;
        else if (c.equipe_id === currentMatch.equipe_b_id) scoreB += c.buts || 0;
    });
    document.getElementById('scoreA').innerText = scoreA;
    document.getElementById('scoreB').innerText = scoreB;
}

// --- REMPLACEMENTS ---
async function prepareSub(compositionIdOut, equipeId, name) {
    try {
        const subs = await fetchSubs(currentMatchId, equipeId);
        if (!subs.length) {
            Swal.fire('Info', 'Aucun remplaçant disponible pour cette équipe.', 'info');
            return;
        }

        const inputOptions = {};
        subs.forEach((s) => { inputOptions[s.id] = `#${s.joueurs.numero} ${s.joueurs.nom_prenom}`; });

        const { value: compositionIdIn } = await Swal.fire({
            title: `Remplacement pour ${escapeHtml(name)}`,
            input: 'select',
            inputOptions,
            inputPlaceholder: 'Choisir le joueur entrant',
            showCancelButton: true,
            confirmButtonText: 'Valider le changement',
            confirmButtonColor: '#00ff88'
        });

        if (compositionIdIn) {
            const incoming = subs.find((s) => s.id === compositionIdIn);
            executeSub(compositionIdOut, compositionIdIn, name, incoming?.joueurs?.nom_prenom || 'Joueur');
        }
    } catch (e) {
        notifyError('Erreur préparation du changement', e);
    }
}

async function executeSub(compositionIdOut, compositionIdIn, nameOut, nameIn) {
    try {
        await setCompositionOut(compositionIdOut);
        await setCompositionStarter(compositionIdIn);

        logEvent('Changement', `${nameOut} ➔ ${nameIn}`, 'fa-exchange-alt', 'CHANGEMENT');
        await loadDirectSquads();
        Swal.fire('Changement effectué !', `${nameIn} est entré en jeu.`, 'success');
    } catch (e) {
        notifyError('Erreur lors du changement', e);
    }
}

// --- STATISTIQUES ---
async function syncMatchScoreFromDom() {
    if (!currentMatchId) return;
    const scoreA = parseInt(document.getElementById('scoreA').innerText, 10) || 0;
    const scoreB = parseInt(document.getElementById('scoreB').innerText, 10) || 0;
    const temps = document.getElementById('chronoDisplay').innerText;
    await syncMatchScore(currentMatchId, scoreA, scoreB, temps);
}

async function updateStat(compositionId, col, name) {
    try {
        const currentValue = await fetchCompositionStat(compositionId, col);

        if (col === 'buts') {
            logEvent(name, 'a marqué un BUT !', 'fa-futbol', 'BUT');
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            Swal.fire({ title: 'BUT !!!', text: `${name} a marqué !`, icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
        }
        if (col === 'jaunes') logEvent(name, 'a reçu un carton JAUNE', 'fa-square yellow-text', 'CARTON');
        if (col === 'rouges') logEvent(name, 'a reçu un carton ROUGE', 'fa-square red-text', 'CARTON');

        await incrementCompositionStat(compositionId, col, currentValue);
        await loadDirectSquads();
        if (col === 'buts') await syncMatchScoreFromDom();
    } catch (e) {
        notifyError('Erreur mise à jour de la statistique', e);
    }
}

// --- HISTORIQUE / RAPPORT ---
function getIconForEvent(type) {
    const icons = { BUT: 'fa-futbol', CARTON: 'fa-square', CHANGEMENT: 'fa-exchange-alt', INFO: 'fa-info-circle' };
    return icons[type] || 'fa-dot-circle';
}

async function logEvent(name, action, iconType, eventType = 'INFO') {
    if (!currentMatchId) return;
    try {
        const temps = document.getElementById('chronoDisplay').innerText;
        const description = `<strong>${escapeHtml(name)}</strong> ${escapeHtml(action)}`;
        await insertEvent(currentMatchId, temps, eventType, description);
        loadHistoryView();
    } catch (e) {
        notifyError("Erreur enregistrement de l'événement", e);
    }
}

async function loadHistoryView() {
    const timeline = document.getElementById('timeline');
    if (!currentMatchId) {
        timeline.innerHTML = "<div class=\"timeline-empty\">Sélectionnez un match dans l'onglet Multiplex.</div>";
        return;
    }
    try {
        const data = await fetchEvents(currentMatchId);
        if (!data.length) {
            timeline.innerHTML = '<div class="timeline-empty">Aucun événement enregistré.</div>';
            return;
        }

        timeline.innerHTML = data.map((ev) => `
            <div class="timeline-item">
                <span class="time-tag">${escapeHtml(ev.temps)}</span>
                <i class="fa ${getIconForEvent(ev.type)} event-icon"></i>
                <div class="event-content">${ev.description}</div>
            </div>`).join('');
    } catch (e) {
        notifyError("Erreur chargement de l'historique", e);
    }
}

async function generateReport() {
    if (!currentMatchId) {
        Swal.fire('Info', "Sélectionnez un match d'abord.", 'info');
        return;
    }
    try {
        const events = await fetchEvents(currentMatchId);
        const chronologicalEvents = [...events].reverse();

        const scoreA = document.getElementById('scoreA').innerText;
        const scoreB = document.getElementById('scoreB').innerText;

        const eventsHtml = chronologicalEvents
            .map((ev) => `<li style="padding: 5px 0; border-bottom: 1px solid #eee;">[${escapeHtml(ev.temps)}] ${ev.description.replace(/<[^>]*>?/gm, '')}</li>`)
            .join('');

        const reportContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; text-align: left;">
                <h2 style="text-align: center; color: #000;">RAPPORT OFFICIEL - LPA PRO</h2>
                <hr>
                <div style="display: flex; justify-content: space-around; font-size: 24px; font-weight: bold; margin: 20px 0;">
                    <span>${escapeHtml(nameForEquipe(currentMatch?.equipe_a_id))}: ${scoreA}</span>
                    <span>VS</span>
                    <span>${escapeHtml(nameForEquipe(currentMatch?.equipe_b_id))}: ${scoreB}</span>
                </div>
                <h4>ÉVÉNEMENTS DU MATCH :</h4>
                <ul style="list-style: none; padding: 0;">${eventsHtml}</ul>
                <p style="margin-top: 30px; font-size: 12px; color: #666; text-align: center;">Généré le ${new Date().toLocaleString()}</p>
            </div>
        `;

        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Rapport de Match</title></head><body>${reportContent}</body></html>`);
        win.document.close();
        win.print();
    } catch (e) {
        notifyError('Erreur génération du rapport', e);
    }
}

// --- ÉVÉNEMENTS DOM ---
function bindEvents() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
    document.getElementById('addPlayerForm').addEventListener('submit', handleAddPlayer);
    document.getElementById('createMatchForm').addEventListener('submit', handleCreateMatch);

    document.getElementById('matchDuration').addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        matchDuration = (Number.isFinite(val) && val > 0) ? val : 90;
    });

    document.getElementById('navTabs').addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('a[data-view]');
        if (link) { showView(link.dataset.view); return; }
        if (e.target.closest('#logoutTab')) handleLogout();
    });

    document.getElementById('app').addEventListener('click', async (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const { action, id, name, team } = el.dataset;

        if (action === 'goal') updateStat(id, 'buts', name);
        else if (action === 'yellow') updateStat(id, 'jaunes', name);
        else if (action === 'sub') prepareSub(id, team, name);
        else if (action === 'auth-tab') showAuthTab(id);
        else if (action === 'select-match') { await selectMatch(id); showView('view-lineup'); }
        else if (action === 'piloter-match') { await selectMatch(id); showView('view-admin'); }
        else if (action === 'delete-roster') {
            try { await deleteJoueurRoster(id); loadTeamSpace(); } catch (err) { notifyError('Erreur suppression du joueur', err); }
        } else if (action === 'valider-equipe') {
            try { await validerEquipe(id); loadOrganisateurSpace(); } catch (err) { notifyError('Erreur validation équipe', err); }
        } else if (action === 'demarrer-match') {
            try { await updateMatchStatut(id, 'en_cours'); loadDirectView(); } catch (err) { notifyError('Erreur démarrage du match', err); }
        } else if (action === 'revert-match') {
            try { await updateMatchStatut(id, 'a_venir'); loadDirectView(); } catch (err) { notifyError('Erreur lors du repassage à "à venir"', err); }
        } else if (action === 'valider-composition') {
            const selects = document.querySelectorAll(`.composition-select[data-match-id="${id}"]`);
            try {
                await Promise.all(Array.from(selects).map((sel) =>
                    upsertComposition(id, sel.dataset.joueurId, sel.dataset.equipeId, sel.value)
                ));
                Swal.fire('Composition validée', 'Votre composition a été enregistrée pour ce match.', 'success');
                loadTeamSpace();
            } catch (err) {
                notifyError('Erreur validation de la composition', err);
            }
        }
    });
}

// --- REALTIME (CALLBACKS) ---
function onMatchsRealtimeChange() {
    if (document.getElementById('view-live').style.display !== 'none') loadLiveMatches();
    if (currentRole?.type === 'admin' && document.getElementById('view-organisateur').style.display !== 'none') loadOrganisateurSpace();
    if (currentMatchId && document.getElementById('view-admin').style.display !== 'none') loadDirectView();
}

function onEquipesRealtimeChange() {
    refreshEquipesCache();
    if (currentRole?.type === 'admin' && document.getElementById('view-organisateur').style.display !== 'none') loadOrganisateurSpace();
}

function onCompositionsRealtimeChange() {
    if (document.getElementById('view-admin').style.display !== 'none') loadDirectSquads();
    if (document.getElementById('view-lineup').style.display !== 'none') loadLineupView();
    if (currentRole?.type === 'equipe' && document.getElementById('view-team').style.display !== 'none') loadTeamSpace();
}

function onEvenementsRealtimeChange() {
    if (document.getElementById('view-history').style.display !== 'none') loadHistoryView();
}

// --- INITIALISATION ---
window.onload = async () => {
    bindEvents();
    renderNav();
    await refreshEquipesCache();
    showView('view-live');
    subscribeGlobal();

    onAuthChange(async (session) => {
        currentSession = session;
        if (session) {
            try {
                await completePendingSignup(session);
            } catch (e) {
                notifyError("Erreur finalisation de l'inscription équipe", e);
            }
        }
        currentRole = await resolveRole(session);
        renderNav();
    });
};
