// --- ACCÈS DONNÉES (SUPABASE) ---

const SUPABASE_URL = 'https://gamyqxfkmqdubrbvzxul.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4lUnrZT8akVxsr3PDnOCAA_gmam4b_X';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- CHAMPIONNATS ---
async function fetchChampionnats() {
    const { data, error } = await supabaseClient
        .from('championnats')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function fetchChampionnatById(championnatId) {
    const { data, error } = await supabaseClient.from('championnats').select('*').eq('id', championnatId).single();
    if (error) throw error;
    return data;
}

// --- ÉQUIPES ---
async function fetchAllEquipes(championnatId) {
    const { data, error } = await supabaseClient
        .from('equipes')
        .select('*')
        .eq('championnat_id', championnatId)
        .order('nom', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function fetchEquipesEnAttente(championnatId) {
    const { data, error } = await supabaseClient
        .from('equipes')
        .select('*')
        .eq('championnat_id', championnatId)
        .eq('statut', 'en_attente');
    if (error) throw error;
    return data || [];
}

async function validerEquipe(equipeId) {
    const { error } = await supabaseClient.from('equipes').update({ statut: 'validee' }).eq('id', equipeId);
    if (error) throw error;
}

// --- EFFECTIF (ROSTER PERMANENT) ---
async function fetchRoster(equipeId) {
    const { data, error } = await supabaseClient
        .from('joueurs')
        .select('*')
        .eq('equipe_id', equipeId)
        .order('numero', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function insertJoueurRoster(equipeId, nomPrenom, numero, photoUrl) {
    const { error } = await supabaseClient
        .from('joueurs')
        .insert([{ equipe_id: equipeId, nom_prenom: nomPrenom, numero, photo_url: photoUrl || null }]);
    if (error) throw error;
}

async function deleteJoueurRoster(joueurId) {
    const { error } = await supabaseClient.from('joueurs').delete().eq('id', joueurId);
    if (error) throw error;
}

// --- MATCHS (FIXTURES) ---
async function fetchMatchsEquipe(equipeId) {
    const { data, error } = await supabaseClient
        .from('matchs')
        .select('*')
        .or(`equipe_a_id.eq.${equipeId},equipe_b_id.eq.${equipeId}`)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function fetchMatchsAll(championnatId) {
    const { data, error } = await supabaseClient
        .from('matchs')
        .select('*')
        .eq('championnat_id', championnatId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function fetchMatchById(matchId) {
    const { data, error } = await supabaseClient.from('matchs').select('*').eq('id', matchId).single();
    if (error) throw error;
    return data;
}

async function creerMatch(championnatId, equipeAId, equipeBId, dateHeure) {
    const { error } = await supabaseClient
        .from('matchs')
        .insert([{ championnat_id: championnatId, equipe_a_id: equipeAId, equipe_b_id: equipeBId, date_heure: dateHeure || null }]);
    if (error) throw error;
}

async function updateMatchStatut(matchId, statut) {
    const { error } = await supabaseClient.from('matchs').update({ statut }).eq('id', matchId);
    if (error) throw error;
}

async function updateMatchPeriode(matchId, periode) {
    const { error } = await supabaseClient.from('matchs').update({ periode }).eq('id', matchId);
    if (error) throw error;
}

async function fetchLiveMatches(championnatId) {
    const { data, error } = await supabaseClient
        .from('matchs')
        .select('*')
        .eq('championnat_id', championnatId)
        .eq('statut', 'en_cours')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function syncMatchScore(matchId, scoreA, scoreB, temps) {
    const { error } = await supabaseClient.from('matchs').update({ score_a: scoreA, score_b: scoreB, temps }).eq('id', matchId);
    if (error) throw error;
}

// --- COMPOSITIONS (SÉLECTION + STATS PAR MATCH) ---
async function fetchComposition(matchId) {
    const { data, error } = await supabaseClient
        .from('compositions')
        .select('*, joueurs(nom_prenom, numero, photo_url)')
        .eq('match_id', matchId);
    if (error) throw error;
    return data || [];
}

async function upsertComposition(matchId, joueurId, equipeId, statut) {
    const { error } = await supabaseClient
        .from('compositions')
        .upsert([{ match_id: matchId, joueur_id: joueurId, equipe_id: equipeId, statut }], { onConflict: 'match_id,joueur_id' });
    if (error) throw error;
}

async function fetchSubs(matchId, equipeId) {
    const { data, error } = await supabaseClient
        .from('compositions')
        .select('*, joueurs(nom_prenom, numero)')
        .eq('match_id', matchId)
        .eq('equipe_id', equipeId)
        .eq('statut', 'Remplacant')
        .eq('est_sorti', false);
    if (error) throw error;
    return data || [];
}

async function setCompositionOut(compositionId) {
    const { error } = await supabaseClient.from('compositions').update({ est_sorti: true }).eq('id', compositionId);
    if (error) throw error;
}

async function setCompositionStarter(compositionId) {
    const { error } = await supabaseClient.from('compositions').update({ statut: 'Titulaire' }).eq('id', compositionId);
    if (error) throw error;
}

async function fetchCompositionStat(compositionId, col) {
    const { data, error } = await supabaseClient.from('compositions').select(col).eq('id', compositionId).single();
    if (error) throw error;
    return data[col] || 0;
}

async function incrementCompositionStat(compositionId, col, currentValue) {
    const { error } = await supabaseClient.from('compositions').update({ [col]: currentValue + 1 }).eq('id', compositionId);
    if (error) throw error;
}

// --- ÉVÉNEMENTS / HISTORIQUE ---
async function insertEvent(matchId, temps, type, description) {
    const { error } = await supabaseClient.from('evenements').insert([{ match_id: matchId, temps, type, description }]);
    if (error) throw error;
}

async function fetchEvents(matchId) {
    const { data, error } = await supabaseClient
        .from('evenements')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// --- REALTIME ---
function subscribeGlobal() {
    supabaseClient
        .channel('global-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matchs' }, () => onMatchsRealtimeChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'equipes' }, () => onEquipesRealtimeChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'championnats' }, () => onChampionnatsRealtimeChange())
        .subscribe();
}

let matchChannel = null;

function subscribeToMatch(matchId) {
    if (matchChannel) {
        supabaseClient.removeChannel(matchChannel);
        matchChannel = null;
    }
    if (!matchId) return;

    matchChannel = supabaseClient
        .channel(`match-${matchId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'compositions', filter: `match_id=eq.${matchId}` }, () => onCompositionsRealtimeChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'evenements', filter: `match_id=eq.${matchId}` }, () => onEvenementsRealtimeChange())
        .subscribe();
}
