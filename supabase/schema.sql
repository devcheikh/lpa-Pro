-- LPA PRO — schéma championnat (comptes équipe + organisateur)
-- À coller une seule fois dans Supabase Dashboard → SQL Editor → Run.
-- ATTENTION : supprime les données existantes (joueurs, matchs, historique de test).

-- 1. Repartir de zéro
drop table if exists compositions cascade;
drop table if exists evenements cascade;
drop table if exists matchs cascade;
drop table if exists joueurs cascade;
drop table if exists equipes cascade;
drop table if exists admins cascade;

-- 2. Tables

create table equipes (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  nom text not null unique,
  statut text not null default 'en_attente' check (statut in ('en_attente','validee')),
  created_at timestamptz not null default now()
);

create table admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade
);

create table joueurs (          -- effectif permanent d'une équipe
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references equipes(id) on delete cascade,
  nom_prenom text not null,
  numero int not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create table matchs (            -- fixtures créées par l'organisateur
  id uuid primary key default gen_random_uuid(),
  equipe_a_id uuid not null references equipes(id),
  equipe_b_id uuid not null references equipes(id),
  date_heure timestamptz,
  statut text not null default 'a_venir' check (statut in ('a_venir','en_cours','termine')),
  score_a int not null default 0,
  score_b int not null default 0,
  temps text not null default '00:00',
  created_at timestamptz not null default now()
);

create table compositions (      -- sélection + stats d'un joueur POUR un match précis
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matchs(id) on delete cascade,
  joueur_id uuid not null references joueurs(id) on delete cascade,
  equipe_id uuid not null references equipes(id),
  statut text not null default 'Non convoque' check (statut in ('Titulaire','Remplacant','Non convoque')),
  est_sorti boolean not null default false,
  buts int not null default 0,
  jaunes int not null default 0,
  rouges int not null default 0,
  unique (match_id, joueur_id)
);

create table evenements (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matchs(id) on delete cascade,
  temps text,
  type text,
  description text,
  created_at timestamptz not null default now()
);

-- 3. Row Level Security

alter table equipes enable row level security;
alter table admins enable row level security;
alter table joueurs enable row level security;
alter table matchs enable row level security;
alter table compositions enable row level security;
alter table evenements enable row level security;

create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from admins where auth_user_id = auth.uid());
$$;

-- equipes : lecture publique, création = son propre compte, validation = admin
create policy "equipes_select_public" on equipes for select using (true);
create policy "equipes_insert_self" on equipes for insert with check (auth.uid() = auth_user_id);
create policy "equipes_update_admin_or_self" on equipes for update
  using (is_admin() or auth.uid() = auth_user_id);

-- admins : chacun ne peut lire que sa propre ligne (pour savoir s'il est admin)
create policy "admins_select_self" on admins for select using (auth.uid() = auth_user_id);

-- joueurs (effectif) : lecture publique, écriture réservée à l'équipe propriétaire
create policy "joueurs_select_public" on joueurs for select using (true);
create policy "joueurs_write_owner" on joueurs for all using (
  exists (select 1 from equipes e where e.id = joueurs.equipe_id and e.auth_user_id = auth.uid())
) with check (
  exists (select 1 from equipes e where e.id = joueurs.equipe_id and e.auth_user_id = auth.uid())
);

-- matchs : lecture publique, écriture réservée à l'admin
create policy "matchs_select_public" on matchs for select using (true);
create policy "matchs_write_admin" on matchs for all using (is_admin()) with check (is_admin());

-- compositions : lecture publique, écriture par l'équipe propriétaire (avant match) ou l'admin (stats live)
create policy "compositions_select_public" on compositions for select using (true);
create policy "compositions_write_owner_or_admin" on compositions for all using (
  is_admin() or exists (select 1 from equipes e where e.id = compositions.equipe_id and e.auth_user_id = auth.uid())
) with check (
  is_admin() or exists (select 1 from equipes e where e.id = compositions.equipe_id and e.auth_user_id = auth.uid())
);

-- evenements : lecture publique, écriture réservée à l'admin
create policy "evenements_select_public" on evenements for select using (true);
create policy "evenements_write_admin" on evenements for all using (is_admin()) with check (is_admin());

-- 4. Realtime : republier les tables recréées (nécessaire car DROP les retire de la publication)
alter publication supabase_realtime add table equipes, joueurs, matchs, compositions, evenements;

-- 5. Bootstrap du premier admin (à faire une fois, manuellement) :
--    1) Authentication → Add user (email + mot de passe de l'organisateur)
--    2) insert into admins (auth_user_id) values ('<uuid copié depuis Authentication>');
