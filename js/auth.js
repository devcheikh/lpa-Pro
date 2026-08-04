// --- AUTHENTIFICATION & RÔLES ---

async function createEquipeRow(authUserId, championnatId, nomEquipe) {
    const { error } = await supabaseClient
        .from('equipes')
        .insert([{ auth_user_id: authUserId, championnat_id: championnatId, nom: nomEquipe }]);
    if (error) throw error;
}

async function createChampionnatRow(organisateurId, nomChampionnat) {
    const { error } = await supabaseClient
        .from('championnats')
        .insert([{ organisateur_id: organisateurId, nom: nomChampionnat }]);
    if (error) throw error;
}

async function signUpEquipe(email, password, nomEquipe, championnatId) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
        // Session active immédiatement (confirmation email désactivée) : on peut créer la ligne équipe tout de suite.
        await createEquipeRow(data.user.id, championnatId, nomEquipe);
    } else if (data.user) {
        // Confirmation email requise : la ligne sera créée à la première connexion réelle de CET utilisateur
        // précis (voir completePendingSignup) — on mémorise son uid pour ne jamais l'attacher à une autre session.
        localStorage.setItem('lpa_pending_signup', JSON.stringify({
            uid: data.user.id, kind: 'equipe', nom: nomEquipe, championnatId
        }));
    }

    return data;
}

async function signUpOrganisateur(email, password, nomChampionnat) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
        await createChampionnatRow(data.user.id, nomChampionnat);
    } else if (data.user) {
        localStorage.setItem('lpa_pending_signup', JSON.stringify({
            uid: data.user.id, kind: 'championnat', nom: nomChampionnat
        }));
    }

    return data;
}

async function completePendingSignup(session) {
    const raw = localStorage.getItem('lpa_pending_signup');
    if (!raw || !session) return;

    let pending;
    try {
        pending = JSON.parse(raw);
    } catch {
        localStorage.removeItem('lpa_pending_signup');
        return;
    }
    if (pending.uid !== session.user.id) return;

    try {
        if (pending.kind === 'equipe') {
            await createEquipeRow(session.user.id, pending.championnatId, pending.nom);
        } else if (pending.kind === 'championnat') {
            await createChampionnatRow(session.user.id, pending.nom);
        }
    } finally {
        localStorage.removeItem('lpa_pending_signup');
    }
}

async function signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
}

async function getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
}

async function resolveMemberships(session) {
    if (!session) return { organises: [], equipes: [] };

    const [{ data: organises }, { data: equipes }] = await Promise.all([
        supabaseClient.from('championnats').select('*').eq('organisateur_id', session.user.id),
        supabaseClient.from('equipes').select('*').eq('auth_user_id', session.user.id)
    ]);

    return { organises: organises || [], equipes: equipes || [] };
}

function onAuthChange(callback) {
    supabaseClient.auth.onAuthStateChange((_event, session) => callback(session));
}
