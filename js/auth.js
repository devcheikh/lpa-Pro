// --- AUTHENTIFICATION & RÔLES ---

async function createEquipeRow(authUserId, nomEquipe) {
    const { error } = await supabaseClient.from('equipes').insert([{ auth_user_id: authUserId, nom: nomEquipe }]);
    if (error) throw error;
}

async function signUpEquipe(email, password, nomEquipe) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
        // Session active immédiatement (confirmation email désactivée) : on peut créer la ligne équipe tout de suite.
        await createEquipeRow(data.user.id, nomEquipe);
    } else if (data.user) {
        // Confirmation email requise : la ligne équipe sera créée à la première connexion réelle (voir completePendingSignup).
        localStorage.setItem('lpa_pending_equipe_nom', nomEquipe);
    }

    return data;
}

async function completePendingSignup(session) {
    const pendingNom = localStorage.getItem('lpa_pending_equipe_nom');
    if (!pendingNom || !session) return;
    try {
        await createEquipeRow(session.user.id, pendingNom);
    } finally {
        localStorage.removeItem('lpa_pending_equipe_nom');
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

async function resolveRole(session) {
    if (!session) return null;

    const { data: adminRow } = await supabaseClient
        .from('admins')
        .select('auth_user_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
    if (adminRow) return { type: 'admin' };

    const { data: equipe } = await supabaseClient
        .from('equipes')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
    if (equipe) return { type: 'equipe', equipe };

    return null;
}

function onAuthChange(callback) {
    supabaseClient.auth.onAuthStateChange((_event, session) => callback(session));
}
