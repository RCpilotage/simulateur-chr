// =====================================================================
//  db.js
//  Couche d'acces aux donnees Supabase pour le Simulateur CHR.
//  Remplace le localStorage par une persistance reseau, scopee a un
//  etablissement et protegee par la securite RLS.
//
//  Authentification : par e-mail avec code a usage unique (OTP).
//  La session est persistante par appareil ; les donnees suivent
//  l'utilisateur sur tous ses appareils.
// =====================================================================
import { supabase } from "./supabaseClient";

let _etabId = null;
export function etablissementId() { return _etabId; }

// ---------------------------------------------------------------------
//  Initialisation. A appeler une fois au demarrage, avant tout
//  chargement. Retourne { authenticated, email }.
//  - Pas de session, ou session anonyme heritee de l'ancienne version :
//    on repart proprement et l'appli affiche l'ecran de connexion.
//  - Session e-mail valide : on garantit l'etablissement courant.
// ---------------------------------------------------------------------
export async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user?.is_anonymous) {
    if (session) { try { await supabase.auth.signOut({ scope: "local" }); } catch (_) {} }
    return { authenticated: false, email: null };
  }
  await ensureEtablissement(session.user.id);
  return { authenticated: true, email: session.user.email || null };
}

async function ensureEtablissement(userId) {
  const { data: etabs, error: e1 } = await supabase
    .from("etablissements").select("id").limit(1);
  if (e1) throw e1;

  if (etabs && etabs.length) {
    _etabId = etabs[0].id;
  } else {
    const { data: created, error: e2 } = await supabase
      .from("etablissements")
      .insert({ owner: userId, nom: "Mon etablissement" })
      .select("id").single();
    if (e2) throw e2;
    _etabId = created.id;
    await supabase.from("parametres").insert({ etablissement_id: _etabId });
  }
  return _etabId;
}

// ---------------------------------------------------------------------
//  Connexion par e-mail : envoi du code, verification, deconnexion.
//  scope "local" a la deconnexion : ne coupe que cet appareil,
//  les sessions ouvertes ailleurs restent valides.
// ---------------------------------------------------------------------
export async function sendCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try { await supabase.auth.signOut({ scope: "local" }); } catch (_) {}
}

// ---------------------------------------------------------------------
//  RH au reel
// ---------------------------------------------------------------------
export async function listRh() {
  const { data, error } = await supabase
    .from("releves_rh")
    .select("id, date_iso, jours, prod_cible, cout_h")
    .eq("etablissement_id", _etabId)
    .order("date_iso", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, dateIso: r.date_iso, jours: r.jours,
    prodCible: Number(r.prod_cible), coutH: Number(r.cout_h),
  }));
}
export async function addRh(e) {
  const { data, error } = await supabase
    .from("releves_rh")
    .insert({ etablissement_id: _etabId, date_iso: e.dateIso, jours: e.jours, prod_cible: e.prodCible, cout_h: e.coutH })
    .select("id").single();
  if (error) throw error;
  return data.id;
}
export async function removeRh(id) {
  const { error } = await supabase.from("releves_rh").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
//  Matiere au reel
// ---------------------------------------------------------------------
export async function listMat() {
  const { data, error } = await supabase
    .from("releves_matiere")
    .select("id, date_iso, periode, familles")
    .eq("etablissement_id", _etabId)
    .order("date_iso", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, dateIso: r.date_iso, periode: r.periode, familles: r.familles,
  }));
}
export async function addMat(e) {
  const { data, error } = await supabase
    .from("releves_matiere")
    .insert({ etablissement_id: _etabId, date_iso: e.dateIso, periode: e.periode, familles: e.familles })
    .select("id").single();
  if (error) throw error;
  return data.id;
}
export async function removeMat(id) {
  const { error } = await supabase.from("releves_matiere").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
//  Clotures comptables (marge nette)  -  une par mois (upsert)
// ---------------------------------------------------------------------
export async function listClot() {
  const { data, error } = await supabase
    .from("clotures")
    .select("id, mois, ca, resultat_net")
    .eq("etablissement_id", _etabId)
    .order("mois", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, mois: r.mois, ca: Number(r.ca), resultatNet: Number(r.resultat_net),
  }));
}
export async function upsertClot(e) {
  const { data, error } = await supabase
    .from("clotures")
    .upsert(
      { etablissement_id: _etabId, mois: e.mois, ca: e.ca, resultat_net: e.resultatNet },
      { onConflict: "etablissement_id,mois" }
    )
    .select("id").single();
  if (error) throw error;
  return data.id;
}
export async function removeClot(id) {
  const { error } = await supabase.from("clotures").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
//  Parametres : rotation annuelle + courbe de saisonnalite (1 ligne)
// ---------------------------------------------------------------------
export async function getParams() {
  const { data, error } = await supabase
    .from("parametres")
    .select("rotation_departs, rotation_effectif, saisonnalite")
    .eq("etablissement_id", _etabId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    rotationDeparts: Number(data.rotation_departs),
    rotationEffectif: Number(data.rotation_effectif),
    saisonnalite: data.saisonnalite,
  };
}
export async function saveParams(p) {
  const { error } = await supabase
    .from("parametres")
    .upsert(
      {
        etablissement_id: _etabId,
        rotation_departs: p.rotationDeparts,
        rotation_effectif: p.rotationEffectif,
        saisonnalite: p.saisonnalite,
        maj_le: new Date().toISOString(),
      },
      { onConflict: "etablissement_id" }
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------
//  Analyses annuelles (snapshots du diagnostic)
// ---------------------------------------------------------------------
export async function listAnalyses() {
  const { data, error } = await supabase
    .from("analyses_annuelles")
    .select("id, date_iso, donnees, score")
    .eq("etablissement_id", _etabId)
    .order("date_iso", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, dateIso: r.date_iso, donnees: r.donnees,
    score: r.score == null ? null : Number(r.score),
  }));
}
export async function addAnalyse(e) {
  const { data, error } = await supabase
    .from("analyses_annuelles")
    .insert({ etablissement_id: _etabId, date_iso: e.dateIso, donnees: e.donnees, score: e.score })
    .select("id").single();
  if (error) throw error;
  return data.id;
}
export async function removeAnalyse(id) {
  const { error } = await supabase.from("analyses_annuelles").delete().eq("id", id);
  if (error) throw error;
}
