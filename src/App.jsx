import React, { useState, useEffect, useRef, useMemo } from "react";
import { Printer, RotateCcw, ArrowRight, TrendingUp, TrendingDown, ArrowLeft, Trash2, Save, Clock, Info, LogOut } from "lucide-react";
import * as db from "./db";

/* ============================================================
   R&C PILOTAGE · Diagnostic & pilotage d'exploitation
   Outil d'aide à la décision : saisie → diagnostic → plan d'action
   ============================================================ */

/* ---------- Références métier & pondérations ---------- */
const TARGETS = { foodCost: 30, masseSal: 33, margeNette: 10, ticket: 27, productivite: 64, rotation: 25 };
const WEIGHTS = { foodCost: 25, masseSal: 25, margeNette: 20, productivite: 15, ticket: 10, rotation: 5 };

// Fenêtres de notation (valeur "bonne" = 100, valeur "zéro" = 0)
const SCORE_CFG = {
  foodCost:     { good: 30, zero: 45, dir: "low",  axisMin: 15, axisMax: 50 },
  masseSal:     { good: 33, zero: 48, dir: "low",  axisMin: 20, axisMax: 55 },
  rotation:     { good: 25, zero: 75, dir: "low",  axisMin: 0,  axisMax: 80 },
  margeNette:   { good: 10, zero: 0,  dir: "high", axisMin: -5, axisMax: 20 },
  ticket:       { good: 27, zero: 12, dir: "high", axisMin: 10, axisMax: 45 },
  productivite: { good: 64, zero: 32, dir: "high", axisMin: 25, axisMax: 90 },
};

// Coût moyen estimé d'un départ en CHR (recrutement + formation + sous-productivité)
const COUT_DEPART = 3500;

/* ---------- Palettes (les 3 directions en cours d'arbitrage) ---------- */
const THEMES = {
  noir: {
    name: "Noir",
    vars: {
      "--bg": "#0A0A0A", "--bg2": "#0F0F0F", "--surface": "#141414", "--surface2": "#1A1A1A",
      "--border": "rgba(241,240,235,0.10)", "--border2": "rgba(241,240,235,0.24)",
      "--text": "#F1F0EB", "--muted": "#9A9FA4", "--faint": "#70747A",
      "--green": "#3E8F66", "--green-bg": "rgba(62,143,102,0.14)",
      "--red": "#B14F49", "--red-bg": "rgba(177,79,73,0.14)",
      "--shadow": "rgba(0,0,0,0.50)",
    },
  },
  ardoise: {
    name: "Ardoise",
    vars: {
      "--bg": "#14151A", "--bg2": "#191B20", "--surface": "#1E2026", "--surface2": "#24262D",
      "--border": "rgba(235,236,240,0.10)", "--border2": "rgba(235,236,240,0.22)",
      "--text": "#ECEDF0", "--muted": "#969AA3", "--faint": "#686C75",
      "--green": "#3E8F66", "--green-bg": "rgba(62,143,102,0.15)",
      "--red": "#B14F49", "--red-bg": "rgba(177,79,73,0.15)",
      "--shadow": "rgba(0,0,0,0.40)",
    },
  },
  papier: {
    name: "Papier",
    vars: {
      "--bg": "#EEEDE5", "--bg2": "#F1F0EB", "--surface": "#FBFBF7", "--surface2": "#FFFFFF",
      "--border": "rgba(18,18,17,0.14)", "--border2": "rgba(18,18,17,0.30)",
      "--text": "#121211", "--muted": "#54544E", "--faint": "#8C8C83",
      "--green": "#3E8F66", "--green-bg": "rgba(62,143,102,0.10)",
      "--red": "#B14F49", "--red-bg": "rgba(177,79,73,0.09)",
      "--shadow": "rgba(40,36,26,0.10)",
    },
  },
};

/* ---------- Jeu d'exemple (exploitation réaliste, mix conforme / dégradé) ---------- */
const DEFAULT_INPUTS = {
  caNourriture: "520000", caBoissons: "180000", couverts: "24500", joursOuverts: "305",
  joursParSemaine: "7",
  achatsAlim: "150000", achatsBoissons: "47000", masseSal: "240000", resultatNet: "56000",
  effectifMoyen: "13", departs: "3", heures: "16800",
  places: "80", servicesJour: "2",
};

const FIELD_GROUPS = [
  { title: "Activité & chiffre d'affaires", fields: [
    { k: "caNourriture", label: "CA nourriture (HT)", unit: "€" },
    { k: "caBoissons", label: "CA boissons (HT)", unit: "€" },
    { k: "couverts", label: "Nombre de couverts", unit: "" },
    { k: "joursOuverts", label: "Jours d'ouverture / an", unit: "" },
    { k: "joursParSemaine", label: "Jours d'ouverture / semaine", unit: "" },
  ]},
  { title: "Coûts d'exploitation", fields: [
    { k: "achatsAlim", label: "Achats alimentaires (HT)", unit: "€" },
    { k: "achatsBoissons", label: "Achats boissons (HT)", unit: "€" },
    { k: "masseSal", label: "Masse salariale chargée", unit: "€" },
    { k: "resultatNet", label: "Résultat net", unit: "€" },
  ]},
  { title: "Équipe", fields: [
    { k: "effectifMoyen", label: "Effectif moyen (ETP)", unit: "" },
    { k: "departs", label: "Départs sur l'année", unit: "" },
    { k: "heures", label: "Heures travaillées", unit: "h" },
  ]},
  { title: "Capacité", fields: [
    { k: "places", label: "Places assises", unit: "" },
    { k: "servicesJour", label: "Services par jour", unit: "" },
  ]},
];

const ACTION_LIB = {
  foodCost: {
    titre: "Reprendre le contrôle du coût matière",
    pourquoi: "Le coût matière dépasse sa cible. Chaque point au-dessus, c'est de la marge qui part en cuisine sans qu'on la voie.",
    leviers: [
      "Fiches techniques chiffrées et portions standardisées",
      "Inventaires réguliers, suivi des pertes et de la casse",
      "Rotation FIFO et maîtrise des DLC",
      "Mise en concurrence et renégociation fournisseurs",
      "Analyse du mix-menu : retravailler les plats à faible marge",
    ],
  },
  masseSal: {
    titre: "Aligner la masse salariale sur l'activité",
    pourquoi: "Le poids de la masse salariale dépasse la cible. L'enjeu n'est pas de couper, mais d'ajuster l'effectif présent à l'affluence réelle, service par service.",
    leviers: [
      "Planning calé sur les prévisions de couverts (heures pleines / creuses)",
      "Polyvalence des postes pour absorber les pics",
      "Suivi hebdomadaire du ratio heures travaillées / CA",
      "Réduction des heures improductives (mise en place, fermeture)",
      "Arbitrage extra / CDI selon la saisonnalité",
    ],
  },
  margeNette: {
    titre: "Restaurer la marge nette",
    pourquoi: "La rentabilité finale décroche. Elle se gagne sur les coûts variables (matière, personnel) autant que sur les charges fixes.",
    leviers: [
      "Revue de la politique tarifaire et du ticket moyen",
      "Renégociation des charges fixes (loyer, énergie, abonnements)",
      "Suivi mensuel du compte de résultat poste par poste",
      "Pilotage des achats hors-matière (consommables, maintenance)",
    ],
  },
  ticket: {
    titre: "Faire progresser le ticket moyen",
    pourquoi: "Le panier moyen est sous la référence. Quelques euros par couvert, multipliés sur l'année, pèsent lourd. Et sans un centime d'acquisition en plus.",
    leviers: [
      "Menu engineering : mettre en avant les plats à forte marge",
      "Ventes additionnelles (entrée, dessert, café)",
      "Travail sur la carte des boissons (marge la plus élevée)",
      "Formules construites pour augmenter l'addition",
    ],
  },
  productivite: {
    titre: "Produire mieux, à effectif constant",
    pourquoi: "Le CA par heure travaillée est en retrait. Le sujet n'est pas de produire plus, mais de mieux produire à effectif constant.",
    leviers: [
      "Optimisation de la mise en place et des process de service",
      "Réduction des temps morts et des tâches à faible valeur",
      "Outils de pilotage des plannings et des présences",
      "Dimensionnement des services selon la fréquentation",
    ],
  },
  rotation: {
    titre: "Stabiliser les équipes",
    pourquoi: "Le turnover dépasse la zone saine. Chaque départ coûte en recrutement, en formation et en perte de productivité le temps de la montée en compétence.",
    leviers: [
      "Parcours d'intégration structuré dès l'arrivée",
      "Conditions de travail et organisation des plannings",
      "Management de proximité et points réguliers",
      "Perspectives d'évolution et reconnaissance",
    ],
  },
};

const APPUI_LIB = {
  foodCost:     { titre: "Coût matière maîtrisé",     apport: "La marge se construit dès la cuisine. Tout euro non perdu en matière tombe directement en résultat : c'est l'appui le plus solide." },
  masseSal:     { titre: "Masse salariale tenue",     apport: "L'effectif est calé sur l'activité. C'est rare et précieux : la plupart des dérives de rentabilité viennent justement de là." },
  margeNette:   { titre: "Rentabilité au rendez-vous", apport: "L'exploitation garde ce qu'elle gagne. Le modèle est sain : de quoi investir et encaisser les imprévus." },
  ticket:       { titre: "Bon ticket moyen",          apport: "Chaque couvert rapporte. La carte et le travail de salle font leur effet sans courir après le volume." },
  productivite: { titre: "Productivité au rendez-vous", apport: "Beaucoup de CA par heure travaillée. C'est le pivot qui tient la masse salariale dans sa cible." },
  rotation:     { titre: "Équipe stable",             apport: "Peu de départs : de la qualité d'exécution, des coûts de recrutement évités, un savoir-faire qui reste dans la maison." },
};

// Points d'appui : ce que signifie un indicateur tenu, et comment le protéger
const STRENGTH_LIB = {
  foodCost:     { titre: "Coût matière maîtrisé", note: "La marge la plus volatile du métier est sous contrôle, l'essentiel est protégé. À re-vérifier à chaque changement de carte ou de fournisseur." },
  masseSal:     { titre: "Masse salariale tenue", note: "L'effectif est aligné sur l'activité, sur le poste le plus dur à piloter. Gardez le lien planning / affluence à chaque variation de saison." },
  margeNette:   { titre: "Rentabilité au rendez-vous", note: "Ce qui reste après charges est dans la cible. La preuve que l'ensemble tient, pas un ratio isolé." },
  ticket:       { titre: "Ticket moyen solide", note: "Le panier moyen travaille pour vous. Un acquis qui se protège : cohérence de la carte, de la montée en gamme, du service." },
  productivite: { titre: "Organisation efficace", note: "Vous produisez bien à effectif donné. Mise en place et service rodés. C'est aussi ce qui soutient la masse salariale." },
  rotation:     { titre: "Équipe stable", note: "Peu de turnover, un actif rare dans le métier. Une équipe qui reste, c'est de l'exécution constante et des coûts de recrutement évités." },
};

/* ---------- Helpers ---------- */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (s) => {
  const v = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return isFinite(v) ? v : 0;
};
const eur = (n, d = 0) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const fnum = (n, d = 1) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

function scoreFor(value, cfg) {
  if (!isFinite(value)) return 0;
  let s;
  if (cfg.dir === "low") s = value <= cfg.good ? 100 : value >= cfg.zero ? 0 : (100 * (cfg.zero - value)) / (cfg.zero - cfg.good);
  else s = value >= cfg.good ? 100 : value <= cfg.zero ? 0 : (100 * (value - cfg.zero)) / (cfg.good - cfg.zero);
  return clamp(s, 0, 100);
}

/* ---------- Cœur du calcul ---------- */
function compute(inp) {
  const i = Object.fromEntries(Object.entries(inp).map(([k, v]) => [k, num(v)]));
  const caTotal = i.caNourriture + i.caBoissons;

  const safe = (a, b) => (b > 0 ? a / b : NaN);
  const raw = {
    foodCost: safe(i.achatsAlim, i.caNourriture) * 100,
    masseSal: safe(i.masseSal, caTotal) * 100,
    margeNette: safe(i.resultatNet, caTotal) * 100,
    ticket: safe(caTotal, i.couverts),
    productivite: safe(caTotal, i.heures),
    rotation: safe(i.departs, i.effectifMoyen) * 100,
  };
  const bevCost = safe(i.achatsBoissons, i.caBoissons) * 100;

  const META = {
    foodCost:     { label: "Food cost",            short: "Food cost",  unit: "%",   d: 1,
      def: "Part du CA nourriture absorbée par les achats alimentaires. Coût matière ÷ CA nourriture.",
      seuil: "Cible ≤ 30 %. Repère CHR : 28 à 32 %. Au-delà, ce sont presque toujours des pertes non vues : portions, démarque, réception mal contrôlée." },
    masseSal:     { label: "Masse salariale",       short: "Masse sal.", unit: "%",   d: 1,
      def: "Poids du coût du travail dans le CA total. Masse salariale chargée ÷ CA. Autre lecture : coût horaire moyen ÷ productivité horaire.",
      seuil: "Cible ≤ 33 %. Repère CHR : 32 à 38 % selon le concept. Le levier n'est pas de couper, mais d'aligner l'effectif présent sur l'affluence réelle." },
    margeNette:   { label: "Marge nette",           short: "Marge",      unit: "%",   d: 1,
      def: "Ce qui reste réellement une fois toutes les charges payées. Résultat net ÷ CA total.",
      seuil: "Cible ≥ 10 %. Repère CHR : 8 à 12 %. En dessous, l'établissement travaille beaucoup pour garder peu." },
    ticket:       { label: "Ticket moyen",          short: "Ticket",     unit: "€",   d: 2,
      def: "Dépense moyenne par couvert. CA total ÷ nombre de couverts.",
      seuil: "Objectif ≥ 27 €. Quelques euros gagnés par couvert pèsent lourd sur l'année, sans un centime d'acquisition en plus." },
    productivite: { label: "Productivité",          short: "Product.",   unit: "€/h", d: 1,
      def: "CA généré par heure travaillée. CA total ÷ heures payées.",
      seuil: "Cible ≥ 64 €/h. C'est le pivot de la masse salariale : à coût horaire donné, c'est elle qui fait le ratio." },
    rotation:     { label: "Rotation du personnel", short: "Turnover",   unit: "%",   d: 1,
      def: "Renouvellement des équipes sur l'année. Départs ÷ effectif moyen.",
      seuil: "Repère interne ≤ 25 %. Chaque départ coûte en recrutement, formation et montée en compétence. Au-delà, l'instabilité se paie en exécution." },
  };

  const kpis = Object.keys(META).map((key) => {
    const cfg = SCORE_CFG[key];
    const m = META[key];
    const value = raw[key];
    const target = TARGETS[key];
    const ok = isFinite(value) ? (cfg.dir === "low" ? value <= target : value >= target) : false;
    const score = scoreFor(value, cfg);
    const diff = isFinite(value) ? value - target : 0;
    const sign = diff > 0 ? "+" : "−";
    const absd = Math.abs(diff);
    const ecartText =
      m.unit === "%" ? `${sign}${fnum(absd, 1)} pts`
      : m.unit === "€" ? `${sign}${fnum(absd, 2)} €`
      : `${sign}${fnum(absd, 1)} €/h`;
    return { key, ...m, value, target, dir: cfg.dir, status: ok ? "ok" : "ko", score, ecartText, axisMin: cfg.axisMin, axisMax: cfg.axisMax };
  });

  // Score global pondéré
  const scoreGlobal = Math.round(kpis.reduce((s, k) => s + (k.score * WEIGHTS[k.key]) / 100, 0));

  const BANDS = [
    { min: 90, label: "Excellent", key: "green", phrase: "Exploitation maîtrisée. Les indicateurs sont dans leurs cibles ; l'enjeu devient le maintien." },
    { min: 80, label: "Très performant", key: "green", phrase: "Exploitation solide. Quelques écarts à corriger, rien de structurel." },
    { min: 70, label: "Correct", key: "amber", phrase: "Correcte en surface, mais des dérives s'installent. Le bon moment pour agir, c'est maintenant." },
    { min: 60, label: "Sous surveillance", key: "amber", phrase: "Signaux de fragilité nets. Plusieurs leviers décrochent de leur cible." },
    { min: -999, label: "Critique", key: "red", phrase: "Situation critique. L'établissement tourne, mais il n'est plus piloté." },
  ];
  const band = BANDS.find((b) => scoreGlobal >= b.min);

  // Impacts financiers (estimations indicatives)
  const impacts = [];
  const fc = raw.foodCost, ms = raw.masseSal, mn = raw.margeNette, tm = raw.ticket, rot = raw.rotation;
  if (isFinite(fc) && fc > TARGETS.foodCost)
    impacts.push({ key: "foodCost", label: "Surcoût matière (nourriture)", amount: ((fc - TARGETS.foodCost) / 100) * i.caNourriture, nature: "marge",
      note: `${fnum(fc - TARGETS.foodCost, 1)} pts au-dessus de l'objectif, appliqués au CA nourriture.` });
  if (isFinite(ms) && ms > TARGETS.masseSal)
    impacts.push({ key: "masseSal", label: "Surcoût de masse salariale", amount: ((ms - TARGETS.masseSal) / 100) * caTotal, nature: "marge",
      note: `${fnum(ms - TARGETS.masseSal, 1)} pts au-dessus de l'objectif, appliqués au CA total.` });
  if (isFinite(rot) && rot > TARGETS.rotation) {
    const excess = ((rot - TARGETS.rotation) / 100) * i.effectifMoyen;
    impacts.push({ key: "rotation", label: "Coût du turnover excédentaire", amount: excess * COUT_DEPART, nature: "marge",
      note: `≈ ${fnum(excess, 1)} départ(s) au-delà du seuil sain × ${eur(COUT_DEPART)} par départ.` });
  }
  if (isFinite(tm) && tm < TARGETS.ticket)
    impacts.push({ key: "ticket", label: "Potentiel de CA additionnel", amount: (TARGETS.ticket - tm) * i.couverts, nature: "revenu",
      note: `${eur(TARGETS.ticket - tm, 2)} par couvert × ${fnum(i.couverts, 0)} couverts.` });
  if (isFinite(mn) && mn < TARGETS.margeNette)
    impacts.push({ key: "margeNette", label: "Écart vs objectif de marge", amount: ((TARGETS.margeNette - mn) / 100) * caTotal, nature: "contexte",
      note: "Conséquence des écarts ci-dessus, pas un coût qui s'ajoute." });

  const totalMargeLeak = impacts.filter((x) => x.nature === "marge").reduce((s, x) => s + x.amount, 0);
  const totalRevenu = impacts.filter((x) => x.nature === "revenu").reduce((s, x) => s + x.amount, 0);

  // Synthèse dirigeant (équilibrée : appuis avant frictions)
  const reds = kpis.filter((k) => k.status === "ko").sort((a, b) => WEIGHTS[b.key] * (100 - b.score) - WEIGHTS[a.key] * (100 - a.score));
  const greens = kpis.filter((k) => k.status === "ok").sort((a, b) => WEIGHTS[b.key] - WEIGHTS[a.key]);
  const fmtVal = (k) => k.unit === "€" ? eur(k.value, 2) : k.unit === "€/h" ? `${fnum(k.value, 0)} €/h` : `${fnum(k.value, 1)} %`;
  const fmtCible = (k) => `${k.dir === "low" ? "≤" : "≥"} ${k.unit === "€" ? eur(k.target, 0) : k.unit === "€/h" ? `${fnum(k.target, 0)} €/h` : `${fnum(k.target, 0)} %`}`;
  const appuis = greens.map((k) => ({ key: k.key, valTxt: fmtVal(k), cibleTxt: fmtCible(k), ...APPUI_LIB[k.key] }));

  let synthese = band.phrase + " ";
  if (reds.length === 0) {
    synthese += "Les six indicateurs tiennent leur cible. L'enjeu n'est plus de corriger, mais de tenir dans la durée.";
  } else {
    if (greens.length > 0)
      synthese += `${greens.length} indicateur${greens.length > 1 ? "s" : ""} sur 6 ${greens.length > 1 ? "tiennent" : "tient"} leur cible : c'est la base sur laquelle s'appuyer. `;
    synthese += reds.length === 1
      ? `Un point de friction ressort : ${reds[0].label.toLowerCase()}.`
      : `Les points de friction à traiter : ${reds.slice(0, 2).map((r) => r.label.toLowerCase()).join(" et ")}.`;
    if (totalMargeLeak > 0)
      synthese += ` À périmètre constant, ces écarts pèsent de l'ordre de ${eur(totalMargeLeak)} de marge par an.`;
  }

  // Plan d'action (top 3 par urgence = poids × sévérité)
  const plan = reds.slice(0, 3).map((k, idx) => ({ priorite: idx + 1, key: k.key, ...ACTION_LIB[k.key] }));

  // Indicateurs complémentaires
  const capaciteTheo = i.places * i.servicesJour * i.joursOuverts;
  const tauxRemplissage = capaciteTheo > 0 ? (i.couverts / capaciteTheo) * 100 : NaN;
  const complementaires = [
    { label: "Taux de remplissage", value: isFinite(tauxRemplissage) ? `${fnum(tauxRemplissage, 1)} %` : "—", sub: "couverts réalisés / capacité" },
    { label: "Capacité théorique", value: capaciteTheo > 0 ? `${fnum(capaciteTheo, 0)} couv.` : "—", sub: "places × services × jours" },
    { label: "CA / place", value: i.places > 0 ? eur(caTotal / i.places) : "—", sub: "rendement par couvert assis" },
    { label: "Coût matière global", value: caTotal > 0 ? `${fnum(((i.achatsAlim + i.achatsBoissons) / caTotal) * 100, 1)} %` : "—", sub: "matière totale / CA" },
    { label: "Coût horaire moyen", value: i.heures > 0 ? `${fnum(i.masseSal / i.heures, 2)} €/h` : "—", sub: "masse salariale / heures" },
    { label: "Coût moyen / ETP", value: i.effectifMoyen > 0 ? eur(i.masseSal / i.effectifMoyen) : "—", sub: "masse salariale / effectif moyen" },
  ];

  const jr = i.joursOuverts > 0 ? i.joursOuverts : 1;
  const jpw = i.joursParSemaine > 0 ? i.joursParSemaine : 7;
  const W = jpw, MO = jpw * (52 / 12);
  const dCA = caTotal / jr, dCv = i.couverts / jr, dMS = i.masseSal / jr, dH = i.heures / jr;

  // Signaux croisés (lecture entre indicateurs)
  const fcv = raw.foodCost, msv = raw.masseSal, mnv = raw.margeNette, tmv = raw.ticket, pdv = raw.productivite, rtv = raw.rotation, tr = tauxRemplissage;
  const signaux = [];
  if (isFinite(tr) && tr < 60)
    signaux.push({ titre: "Marge de remplissage importante", message: `Votre salle tourne à ${fnum(tr, 0)} % de sa capacité. Le levier est commercial, pas structurel : construire des offres pour remplir les créneaux creux (promotions ciblées, événements, partenariats, mise en avant des services peu fréquentés).` });
  if (isFinite(fcv) && fcv > TARGETS.foodCost && isFinite(tmv) && tmv < TARGETS.ticket)
    signaux.push({ titre: "Problème de carte", message: `Coût matière au-dessus de la cible, ticket moyen en dessous : votre carte coûte cher à produire et rapporte peu par couvert. Piste : menu engineering sur les marges, et travail du panier moyen (suggestions, boissons).` });
  if (isFinite(tr) && tr >= 60 && isFinite(mnv) && mnv < TARGETS.margeNette)
    signaux.push({ titre: "Volume sans rentabilité", message: `Vous remplissez la salle (${fnum(tr, 0)} %) mais la marge nette reste sous l'objectif. Le problème n'est pas le volume, ce sont les coûts (matière, personnel) ou les prix. Le chiffre est là, pas la rentabilité.` });
  if (isFinite(rtv) && rtv > TARGETS.rotation && ((isFinite(pdv) && pdv < TARGETS.productivite) || (isFinite(fcv) && fcv > TARGETS.foodCost)))
    signaux.push({ titre: "Équipe instable", message: `Turnover élevé (${fnum(rtv, 0)} %) et exécution dégradée : une équipe qui tourne trop génère pertes, lenteur et erreurs. Stabiliser les équipes est un préalable aux autres chantiers.` });

  // Lecture croisée positive (synergies qui tiennent)
  const signauxPlus = [];
  if (isFinite(fcv) && fcv <= TARGETS.foodCost && isFinite(tmv) && tmv >= TARGETS.ticket)
    signauxPlus.push({ titre: "Carte rentable", message: `Coût matière maîtrisé et bon ticket moyen : votre carte produit de la marge à chaque couvert. C'est un socle, ne le cassez pas en courant après le volume.` });
  if (isFinite(msv) && msv <= TARGETS.masseSal && isFinite(pdv) && pdv >= TARGETS.productivite)
    signauxPlus.push({ titre: "Organisation efficace", message: `Masse salariale tenue et productivité au rendez-vous : l'organisation est calée sur l'activité. Beaucoup d'établissements cherchent ça sans y arriver.` });
  if (isFinite(mnv) && mnv >= TARGETS.margeNette && isFinite(tr) && tr >= 60)
    signauxPlus.push({ titre: "Volume et marge", message: `Vous remplissez la salle et vous gardez la marge. Les deux ensemble, c'est la signature d'une exploitation réellement pilotée.` });

  const matiereTot = i.achatsAlim + i.achatsBoissons;
  const coutMatiere = caTotal > 0 ? (matiereTot / caTotal) * 100 : 0;
  const coutHoraire = i.heures > 0 ? i.masseSal / i.heures : 0;
  const cadences = [
    { cadence: "Au jour", contexte: "le service", lignes: [
        { label: "Chiffre d'affaires", value: eur(dCA) },
        { label: "Couverts", value: fnum(dCv, 0) },
        { label: "Ticket moyen", value: eur(raw.ticket, 2) },
    ]},
    { cadence: "À la semaine", contexte: "les plannings", lignes: [
        { label: "Masse salariale", value: eur(dMS * W) },
        { label: "Heures travaillées", value: `${fnum(dH * W, 0)} h` },
        { label: "Productivité", value: `${fnum(raw.productivite, 0)} €/h` },
        { label: "Coût horaire moyen", value: `${fnum(coutHoraire, 2)} €/h` },
    ]},
    { cadence: "Au mois", contexte: "la matière", lignes: [
        { label: "Achats matière", value: eur((matiereTot / jr) * MO) },
        { label: "Coût matière", value: `${fnum(coutMatiere, 1)} %` },
        { label: "Marge nette", value: `${fnum(raw.margeNette, 1)} %` },
    ]},
    { cadence: "Au trimestre", contexte: "les équipes", lignes: [
        { label: "Rotation du personnel", value: `${fnum(raw.rotation, 1)} %` },
    ]},
  ];

  return { i, caTotal, bevCost, kpis, scoreGlobal, band, impacts, totalMargeLeak, totalRevenu, synthese, plan, complementaires, signaux, signauxPlus, appuis, cadences };
}

/* ---------- Compteur animé ---------- */
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(target); return;
    }
    const t0 = performance.now();
    const tick = (t) => {
      const p = clamp((t - t0) / duration, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(target * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

/* ---------- Jauge de score (arc SVG) ---------- */
function ScoreGauge({ score }) {
  const v = useCountUp(score);
  const R = 78, cx = 100, cy = 100, sw = 11;
  const a0 = Math.PI, a1 = 0;
  const pt = (ang) => [cx + R * Math.cos(ang), cy - R * Math.sin(ang)];
  const arc = (frac) => {
    const a = a0 + (a1 - a0) * clamp(frac, 0, 1);
    const [x0, y0] = pt(a0), [x1, y1] = pt(a);
    const large = 0; const sweep = 1;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} ${sweep} ${x1} ${y1}`;
  };
  return (
    <svg viewBox="0 0 200 118" className="gauge" role="img" aria-label={`Score ${score} sur 100`}>
      <path d={arc(1)} fill="none" stroke="var(--border2)" strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(v / 100)} fill="none" stroke="var(--text)" strokeWidth={sw} strokeLinecap="round" />
      <text x="100" y="92" textAnchor="middle" className="gauge-num">{Math.round(v)}</text>
      <text x="100" y="110" textAnchor="middle" className="gauge-sub">/ 100</text>
    </svg>
  );
}

/* ---------- Barre de positionnement (valeur vs zone cible) ---------- */
function RangeBar({ kpi }) {
  const { axisMin, axisMax, target, value, dir, status } = kpi;
  const span = axisMax - axisMin || 1;
  const pos = clamp(((value - axisMin) / span) * 100, 0, 100);
  const tgt = clamp(((target - axisMin) / span) * 100, 0, 100);
  const col = status === "ok" ? "var(--green)" : "var(--red)";
  return (
    <div className="rangebar" aria-hidden="true">
      <div className="rangebar-track">
        <div className="rangebar-good" style={dir === "low" ? { left: 0, width: tgt + "%" } : { left: tgt + "%", right: 0 }} />
        <div className="rangebar-tgt" style={{ left: tgt + "%" }} />
        <div className="rangebar-marker" style={{ left: pos + "%", background: col, borderColor: "var(--surface)" }} />
      </div>
      <div className="rangebar-scale">
        <span>{fnum(axisMin, 0)}</span>
        <span>cible {kpi.unit === "€" ? fnum(target, 0) : fnum(target, 0)}{kpi.unit === "%" ? "%" : ""}</span>
        <span>{fnum(axisMax, 0)}</span>
      </div>
    </div>
  );
}

/* ---------- Radar des 6 leviers (SVG maison) ---------- */
function Radar({ kpis }) {
  const cx = 130, cy = 125, R = 92;
  const n = kpis.length;
  const ang = (idx) => -Math.PI / 2 + (idx * 2 * Math.PI) / n;
  const point = (idx, r) => [cx + r * Math.cos(ang(idx)), cy + r * Math.sin(ang(idx))];
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = kpis.map((k, idx) => point(idx, R * (k.score / 100)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 260 250" className="radar" role="img" aria-label="Profil de performance">
      {rings.map((rr, idx) => (
        <polygon key={idx} points={kpis.map((_, i) => point(i, R * rr).join(",")).join(" ")} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {kpis.map((_, idx) => {
        const [x, y] = point(idx, R);
        return <line key={idx} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="var(--border)" stroke="var(--text)" strokeWidth="1.5" style={{ transition: "all .6s ease" }} />
      {kpis.map((k, idx) => {
        const [x, y] = point(idx, R * (k.score / 100));
        return <circle key={idx} cx={x} cy={y} r="3" fill={k.status === "ok" ? "var(--green)" : "var(--red)"} />;
      })}
      {kpis.map((k, idx) => {
        const [x, y] = point(idx, R + 16);
        return (
          <text key={idx} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-lbl">
            {k.short}
          </text>
        );
      })}
    </svg>
  );
}

/* ---------- Carte KPI ---------- */
function KpiCard({ kpi, delay, prev }) {
  const ok = kpi.status === "ok";
  const valTxt =
    kpi.unit === "%" ? `${fnum(kpi.value, 1)} %`
    : kpi.unit === "€" ? eur(kpi.value, 2)
    : `${fnum(kpi.value, 1)} €/h`;
  const tgtTxt = kpi.unit === "€" ? `${kpi.dir === "low" ? "≤" : "≥"} ${eur(kpi.target, 0)}` : `${kpi.dir === "low" ? "≤" : "≥"} ${fnum(kpi.target, 0)} ${kpi.unit}`;
  let deltaTxt = null, deltaUp = null;
  if (prev != null && isFinite(prev) && isFinite(kpi.value)) {
    const d = kpi.value - prev;
    if (Math.abs(d) > 0.0001) {
      const favorable = kpi.dir === "low" ? d < 0 : d > 0;
      deltaUp = favorable;
      deltaTxt = `${d > 0 ? "+" : "−"}${kpi.unit === "€" ? fnum(Math.abs(d), 2) : fnum(Math.abs(d), 1)}${kpi.unit === "%" ? " pts" : kpi.unit === "€" ? " €" : " €/h"} vs précédent`;
    }
  }
  return (
    <div className={"kpi fade-up " + (ok ? "good" : "bad")} style={{ animationDelay: delay + "ms" }}>
      <div className="kpi-head">
        <span className="kpi-name">{kpi.label}</span>
        <div className="kpi-head-r">
          <span className="kpi-info-wrap">
            <button type="button" className="kpi-info" aria-label={`Définition de ${kpi.label}`}><Info size={14} /></button>
            <span className="kpi-tip" role="tooltip">
              <span className="kpi-tip-def">{kpi.def}</span>
              <span className="kpi-tip-seuil">{kpi.seuil}</span>
            </span>
          </span>
          <span className="dot" />
        </div>
      </div>
      <div className="kpi-value">{valTxt}</div>
      <div className="kpi-meta">
        <span>Objectif <b>{tgtTxt}</b></span>
        <span className={ok ? "ecart-ok" : "ecart-ko"}>{kpi.ecartText}</span>
      </div>
      <RangeBar kpi={kpi} />
      {deltaTxt && (
        <div className="kpi-delta" style={{ color: deltaUp ? "var(--green)" : "var(--red)" }}>
          {deltaUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {deltaTxt}
        </div>
      )}
    </div>
  );
}

/* ---------- Champ de saisie ---------- */
function Field({ def, value, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{def.label}</span>
      <span className="field-input">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(def.k, e.target.value)} spellCheck="false" />
        {def.unit && <span className="field-unit">{def.unit}</span>}
      </span>
    </label>
  );
}

/* ===== MODULE GRANULAIRE : RH AU RÉEL ===== */
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const RH_DEFAUT = [
  { ca: 1400, couverts: 50, heures: 50 }, { ca: 1300, couverts: 45, heures: 48 },
  { ca: 1800, couverts: 65, heures: 52 }, { ca: 2200, couverts: 80, heures: 56 },
  { ca: 3500, couverts: 120, heures: 62 }, { ca: 4200, couverts: 140, heures: 64 },
  { ca: 1600, couverts: 60, heures: 50 },
];


const isoToday = () => new Date().toISOString().slice(0, 10);
const semaineLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const j = (d.getDay() + 6) % 7;
  const lundi = new Date(d); lundi.setDate(d.getDate() - j);
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
  return `Semaine du ${lundi.toLocaleDateString("fr-FR")} au ${dimanche.toLocaleDateString("fr-FR")}`;
};
const moisLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const premier = new Date(d.getFullYear(), d.getMonth(), 1);
  const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `Mois du ${premier.toLocaleDateString("fr-FR")} au ${dernier.toLocaleDateString("fr-FR")}`;
};

function MiniTrend({ data }) {
  if (!data || data.length < 2) return null;
  const w = 600, h = 90, pad = 6;
  const vals = data.map((d) => d.value);
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const range = max - min || 1;
  const x = (i) => pad + (i * (w - 2 * pad)) / (data.length - 1);
  const y = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = vals[vals.length - 1], prev = vals[vals.length - 2];
  const delta = last - prev, better = delta < 0;

  const dated = data.filter((d) => d.dateIso);
  const ms = (iso) => new Date(iso + "T00:00:00").getTime();
  const anchor = dated.length ? Math.max(...dated.map((d) => ms(d.dateIso))) : null;
  const moyenne = (jours) => {
    if (anchor == null) return null;
    const cut = anchor - jours * 86400000;
    const win = dated.filter((d) => ms(d.dateIso) <= anchor && ms(d.dateIso) >= cut);
    return win.length ? win.reduce((s, d) => s + d.value, 0) / win.length : null;
  };
  const moyMois = moyenne(31), moyTrim = moyenne(92);

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} className="trend-svg" preserveAspectRatio="none">
        <polygon points={area} className="trend-area" />
        <polyline points={line} className="trend-line" />
      </svg>
      <div className="trend-foot">
        <span className="trend-now">{eur(last)}</span>
        <span className={`trend-delta ${better ? "good" : "bad"}`}>{delta === 0 ? "stable" : `${delta < 0 ? "▼" : "▲"} ${eur(Math.abs(delta))} vs période précédente`}</span>
      </div>
      {(moyMois != null || moyTrim != null) && (
        <div className="trend-avgs">
          {moyMois != null && <span className="trend-avg">Moyenne mois · <b>{eur(moyMois)}</b></span>}
          {moyTrim != null && <span className="trend-avg">Moyenne trimestre · <b>{eur(moyTrim)}</b></span>}
        </div>
      )}
    </div>
  );
}

function RHReel() {
  const [hist, setHist] = useState([]);
  const [dateSel, setDateSel] = useState(isoToday);
  const [prodCible, setProdCible] = useState(64);
  const [coutH, setCoutH] = useState(14.29);
  const [jours, setJours] = useState(RH_DEFAUT);

  const enrichRh = (e) => {
    const coutSem = (e.jours || []).reduce((s, d) => {
      const ec = e.prodCible > 0 ? (Number(d.heures) || 0) - (Number(d.ca) || 0) / e.prodCible : 0;
      return s + (ec > 0 ? ec * e.coutH : 0);
    }, 0);
    return { ...e, date: semaineLabel(e.dateIso), coutSem };
  };

  useEffect(() => {
    let alive = true;
    db.listRh().then((rows) => {
      if (!alive) return;
      const enriched = rows.map(enrichRh).sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));
      setHist(enriched);
      const last = enriched[0];
      if (last) { setProdCible(last.prodCible); setCoutH(last.coutH); setJours(last.jours); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const setCell = (idx, key, v) =>
    setJours((arr) => arr.map((d, i) => (i === idx ? { ...d, [key]: v === "" ? 0 : Number(v) || 0 } : d)));

  const rows = jours.map((d, i) => {
    const prod = d.heures > 0 ? d.ca / d.heures : 0;
    const hJust = prodCible > 0 ? d.ca / prodCible : 0;
    const ecart = d.heures - hJust;
    const cout = ecart > 0 ? ecart * coutH : 0;
    return { jour: JOURS[i], ...d, prod, hJust, ecart, cout };
  });

  const caSem = rows.reduce((s, r) => s + r.ca, 0);
  const cvSem = rows.reduce((s, r) => s + r.couverts, 0);
  const hSem = rows.reduce((s, r) => s + r.heures, 0);
  const prodSem = hSem > 0 ? caSem / hSem : 0;
  const surEffH = rows.reduce((s, r) => s + (r.ecart > 0 ? r.ecart : 0), 0);
  const coutSem = rows.reduce((s, r) => s + r.cout, 0);
  const coutAn = coutSem * 52;
  const pires = rows.filter((r) => r.ecart > 0.5).sort((a, b) => b.cout - a.cout).slice(0, 2).map((r) => r.jour);

  const enregistrer = async () => {
    const label = semaineLabel(dateSel);
    const dupes = hist.filter((e) => e.date === label);
    for (const d of dupes) { try { await db.removeRh(d.id); } catch (_) {} }
    const id = await db.addRh({ dateIso: dateSel, jours, prodCible, coutH });
    const entry = enrichRh({ id, dateIso: dateSel, jours, prodCible, coutH });
    const next = [entry, ...hist.filter((e) => e.date !== label)].sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));
    setHist(next);
  };
  const charger = (e) => { setJours(e.jours); setProdCible(e.prodCible); setCoutH(e.coutH); };
  const supprimer = async (id) => { try { await db.removeRh(id); setHist((h) => h.filter((e) => e.id !== id)); } catch (_) {} };

  return (
    <div className="rh fade-up">
      <div className="intro">
        <p className="eyebrow">Pilotage au réel</p>
        <h1 className="h1">La masse salariale, <i className="em">jour par jour</i>.</h1>
        <p className="lede">Saisissez le CA, les couverts et les heures planifiées, jour par jour. L'outil confronte les heures réelles aux heures justifiées par le CA. Le sur-effectif apparaît là où il se cache, pas dilué dans une moyenne annuelle.</p>
      </div>
      <div className="rh-params">
        <label className="rh-param"><span>Productivité cible</span>
          <span className="rh-pin"><input inputMode="decimal" value={prodCible} onChange={(e) => setProdCible(Number(e.target.value) || 0)} /><i>€/h</i></span></label>
        <label className="rh-param"><span>Coût horaire moyen</span>
          <span className="rh-pin"><input inputMode="decimal" value={coutH} onChange={(e) => setCoutH(Number(e.target.value) || 0)} /><i>€/h</i></span></label>
      </div>
      <div className="rh-tablewrap">
        <div className="rh-table">
          <div className="rh-row rh-head">
            <span>Jour</span><span>CA</span><span>Couv.</span><span>Heures</span><span>Prod.</span><span>Sur-effectif</span><span>Coût/sem.</span>
          </div>
          {rows.map((r, i) => (
            <div className="rh-row" key={r.jour}>
              <span className="rh-jour">{r.jour}</span>
              <span className="rh-cell"><input inputMode="decimal" value={jours[i].ca} onChange={(e) => setCell(i, "ca", e.target.value)} /></span>
              <span className="rh-cell"><input inputMode="decimal" value={jours[i].couverts} onChange={(e) => setCell(i, "couverts", e.target.value)} /></span>
              <span className="rh-cell"><input inputMode="decimal" value={jours[i].heures} onChange={(e) => setCell(i, "heures", e.target.value)} /></span>
              <span className={`rh-out ${r.heures > 0 ? (r.prod >= prodCible ? "good" : "bad") : ""}`}>{r.heures > 0 ? `${fnum(r.prod, 0)} €/h` : "—"}</span>
              <span className={`rh-out ${r.ecart > 0.5 ? "bad" : ""}`}>{r.ecart > 0.5 ? `+${fnum(r.ecart, 0)} h` : "—"}</span>
              <span className={`rh-out ${r.cout > 0 ? "bad" : ""}`}>{r.cout > 0 ? eur(r.cout) : "—"}</span>
            </div>
          ))}
          <div className="rh-row rh-foot">
            <span className="rh-jour">Semaine</span>
            <span className="rh-cell-r">{eur(caSem)}</span>
            <span className="rh-cell-r">{fnum(cvSem, 0)}</span>
            <span className="rh-cell-r">{fnum(hSem, 0)} h</span>
            <span className={`rh-out ${prodSem >= prodCible ? "good" : "bad"}`}>{fnum(prodSem, 0)} €/h</span>
            <span className="rh-out bad">{surEffH > 0.5 ? `+${fnum(surEffH, 0)} h` : "—"}</span>
            <span className="rh-out bad">{coutSem > 0 ? eur(coutSem) : "—"}</span>
          </div>
        </div>
      </div>
      {coutSem > 0 && (
        <div className="rh-synth">
          <div className="rh-synth-fig"><span className="rh-synth-val">{eur(coutSem)}</span><span className="rh-synth-lab">masse salariale en trop / semaine</span></div>
          <div className="rh-synth-fig"><span className="rh-synth-val">≈ {eur(coutAn)}</span><span className="rh-synth-lab">sur l'année (× 52 semaines)</span></div>
          {pires.length > 0 && (
            <p className="rh-synth-txt">Le sur-effectif est concentré sur {pires.length > 1 ? `${pires[0]} et ${pires[1]}` : pires[0]}. C'est là qu'il faut alléger le planning, pas couper partout. {surEffH > 0.5 ? `${fnum(surEffH, 0)} h/semaine à redéployer ou retirer.` : ""}</p>
          )}
        </div>
      )}

      <div className="hist-block">
        <div className="hist-head">
          <span className="hist-title">Semaines enregistrées</span>
          <div className="hist-actions">
            <input type="date" className="hist-date-in" value={dateSel} onChange={(e) => setDateSel(e.target.value)} />
            <span className="hist-periode">{semaineLabel(dateSel)}</span>
            <button className="hist-save" onClick={enregistrer}><Save size={14} /> Enregistrer</button>
          </div>
        </div>
        <MiniTrend data={[...hist].reverse().map((e) => ({ value: e.coutSem || 0, dateIso: e.dateIso }))} />
        {hist.length === 0 ? (
          <p className="hist-empty">Aucune semaine enregistrée. Enregistrez-en une pour les empiler et suivre l'évolution dans le temps.</p>
        ) : (
          <div className="hist-list">
            {hist.map((e) => (
              <div className="hist-row" key={e.id}>
                <span className="hist-date">{e.date}</span>
                <span className="hist-fig">{e.coutSem > 0 ? `${eur(e.coutSem)} de sur-effectif` : "à l'équilibre"}</span>
                <button className="hist-load" onClick={() => charger(e)}>Charger</button>
                <button className="hist-del" onClick={() => supprimer(e.id)} aria-label="Supprimer"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== MODULE GRANULAIRE : MATIÈRE AU RÉEL ===== */
const MAT_DEFAUT = [
  { nom: "Alimentaire", ca: 43000, stockDebut: 8000, achats: 13500, stockFin: 7500, cible: 30 },
  { nom: "Boissons", ca: 15000, stockDebut: 6000, achats: 4200, stockFin: 5500, cible: 28 },
];


function MatiereReel() {
  const [hist, setHist] = useState([]);
  const [dateSel, setDateSel] = useState(isoToday);
  const [periode, setPeriode] = useState("mois");
  const [familles, setFamilles] = useState(MAT_DEFAUT);

  const enrichMat = (e) => {
    const ecartEurTot = (e.familles || []).reduce((s, f) => {
      const conso = (Number(f.stockDebut) || 0) + (Number(f.achats) || 0) - (Number(f.stockFin) || 0);
      const reel = f.ca > 0 ? (conso / f.ca) * 100 : 0;
      const ecartPts = reel - (Number(f.cible) || 0);
      return s + (ecartPts > 0 ? (ecartPts / 100) * f.ca : 0);
    }, 0);
    const labelPer = e.periode === "mois" ? "mois" : "semaine";
    const date = e.periode === "mois" ? moisLabel(e.dateIso) : semaineLabel(e.dateIso);
    return { ...e, ecartEurTot, labelPer, date };
  };

  useEffect(() => {
    let alive = true;
    db.listMat().then((rows) => {
      if (!alive) return;
      const enriched = rows.map(enrichMat).sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));
      setHist(enriched);
      const last = enriched[0];
      if (last) { setPeriode(last.periode); setFamilles(last.familles); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const setCell = (idx, key, v) =>
    setFamilles((arr) => arr.map((f, i) => (i === idx ? { ...f, [key]: v === "" ? 0 : Number(v) || 0 } : f)));

  const rows = familles.map((f) => {
    const conso = f.stockDebut + f.achats - f.stockFin;
    const reel = f.ca > 0 ? (conso / f.ca) * 100 : 0;
    const ecartPts = reel - f.cible;
    const ecartEur = ecartPts > 0 ? (ecartPts / 100) * f.ca : 0;
    return { ...f, conso, reel, ecartPts, ecartEur };
  });

  const caTot = rows.reduce((s, r) => s + r.ca, 0);
  const consoTot = rows.reduce((s, r) => s + r.conso, 0);
  const reelGlobal = caTot > 0 ? (consoTot / caTot) * 100 : 0;
  const ecartEurTot = rows.reduce((s, r) => s + r.ecartEur, 0);
  const mult = periode === "mois" ? 12 : 52;
  const ecartAn = ecartEurTot * mult;
  const labelPer = periode === "mois" ? "mois" : "semaine";

  const enregistrer = async () => {
    const label = periode === "mois" ? moisLabel(dateSel) : semaineLabel(dateSel);
    const dupes = hist.filter((e) => e.date === label);
    for (const d of dupes) { try { await db.removeMat(d.id); } catch (_) {} }
    const id = await db.addMat({ dateIso: dateSel, periode, familles });
    const entry = enrichMat({ id, dateIso: dateSel, periode, familles });
    const next = [entry, ...hist.filter((e) => e.date !== label)].sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));
    setHist(next);
  };
  const charger = (e) => { setFamilles(e.familles); setPeriode(e.periode); };
  const supprimer = async (id) => { try { await db.removeMat(id); setHist((h) => h.filter((e) => e.id !== id)); } catch (_) {} };

  return (
    <div className="mat fade-up">
      <div className="intro">
        <p className="eyebrow">Pilotage au réel</p>
        <h1 className="h1">La matière, <i className="em">au réel</i>.</h1>
        <p className="lede">Comparez votre coût matière réel (ce qui sort vraiment du stock) à votre cible. L'écart, c'est la marge qui s'évapore : gaspillage, portions, réception, démarque. Une période, deux familles, rien de plus.</p>
      </div>

      <div className="mat-periode">
        <button className={`mode-pill ${periode === "semaine" ? "on" : ""}`} onClick={() => setPeriode("semaine")}>Par semaine</button>
        <button className={`mode-pill ${periode === "mois" ? "on" : ""}`} onClick={() => setPeriode("mois")}>Par mois</button>
      </div>

      <div className="mat-cards">
        {rows.map((r, i) => (
          <div className="mat-card" key={r.nom}>
            <div className="mat-card-head">{r.nom}</div>
            <div className="mat-fields">
              <label className="mat-f"><span>CA {labelPer}</span><span className="mat-in"><input inputMode="decimal" value={familles[i].ca} onChange={(e) => setCell(i, "ca", e.target.value)} /><i>€</i></span></label>
              <label className="mat-f"><span>Stock début</span><span className="mat-in"><input inputMode="decimal" value={familles[i].stockDebut} onChange={(e) => setCell(i, "stockDebut", e.target.value)} /><i>€</i></span></label>
              <label className="mat-f"><span>Achats</span><span className="mat-in"><input inputMode="decimal" value={familles[i].achats} onChange={(e) => setCell(i, "achats", e.target.value)} /><i>€</i></span></label>
              <label className="mat-f"><span>Stock fin</span><span className="mat-in"><input inputMode="decimal" value={familles[i].stockFin} onChange={(e) => setCell(i, "stockFin", e.target.value)} /><i>€</i></span></label>
              <label className="mat-f"><span>Cible</span><span className="mat-in"><input inputMode="decimal" value={familles[i].cible} onChange={(e) => setCell(i, "cible", e.target.value)} /><i>%</i></span></label>
            </div>
            <div className="mat-result">
              <div className="mat-r-line"><span>Consommation réelle</span><span>{eur(r.conso)}</span></div>
              <div className="mat-r-line"><span>Coût matière réel</span><span className={r.reel <= r.cible ? "good" : "bad"}>{fnum(r.reel, 1)} %</span></div>
              <div className="mat-r-line"><span>Écart</span><span className={r.ecartPts > 0.05 ? "bad" : "good"}>{r.ecartPts > 0.05 ? `+${fnum(r.ecartPts, 1)} pts · ${eur(r.ecartEur)}` : `${fnum(r.ecartPts, 1)} pt`}</span></div>
            </div>
          </div>
        ))}
      </div>

      {ecartEurTot > 0 && (
        <div className="rh-synth">
          <div className="rh-synth-fig"><span className="rh-synth-val">{eur(ecartEurTot)}</span><span className="rh-synth-lab">matière perdue / {labelPer}</span></div>
          <div className="rh-synth-fig"><span className="rh-synth-val">≈ {eur(ecartAn)}</span><span className="rh-synth-lab">sur l'année (× {mult})</span></div>
          <p className="rh-synth-txt">Coût matière réel global : {fnum(reelGlobal, 1)} %. L'écart avec vos cibles, c'est de la marge perdue : gaspillage, portions non maîtrisées, réception mal contrôlée, démarque. Levier : inventaires réguliers, fiches techniques à jour, contrôle des réceptions.</p>
        </div>
      )}

      <div className="hist-block">
        <div className="hist-head">
          <span className="hist-title">Périodes enregistrées</span>
          <div className="hist-actions">
            <input type="date" className="hist-date-in" value={dateSel} onChange={(e) => setDateSel(e.target.value)} />
            <span className="hist-periode">{periode === "mois" ? moisLabel(dateSel) : semaineLabel(dateSel)}</span>
            <button className="hist-save" onClick={enregistrer}><Save size={14} /> Enregistrer</button>
          </div>
        </div>
        <MiniTrend data={[...hist].reverse().map((e) => ({ value: e.ecartEurTot || 0, dateIso: e.dateIso }))} />
        {hist.length === 0 ? (
          <p className="hist-empty">Aucune période enregistrée. Enregistrez-en une pour empiler vos inventaires et suivre l'évolution de l'écart matière.</p>
        ) : (
          <div className="hist-list">
            {hist.map((e) => (
              <div className="hist-row" key={e.id}>
                <span className="hist-date">{e.date}</span>
                <span className="hist-fig">{e.ecartEurTot > 0 ? `${eur(e.ecartEurTot)} d'écart` : "dans la cible"}</span>
                <button className="hist-load" onClick={() => charger(e)}>Charger</button>
                <button className="hist-del" onClick={() => supprimer(e.id)} aria-label="Supprimer"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================= BILAN ANNUEL (consolidation) ======================= */
const SAISON_DEFAUT = [0.80, 0.85, 0.95, 1.00, 1.08, 1.12, 1.15, 1.05, 1.05, 1.00, 0.90, 1.05];
const MOIS_ABBR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function BilanAnnuel() {
  const [rh, setRh] = useState([]);
  const [mat, setMat] = useState([]);
  const [clotures, setClotures] = useState([]);
  const [rot, setRot] = useState({ departs: 0, effectif: 0 });
  const [cMois, setCMois] = useState("");
  const [cCA, setCCA] = useState("");
  const [cRN, setCRN] = useState("");
  const [saison, setSaison] = useState([...SAISON_DEFAUT]);
  const [showSais, setShowSais] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rhRows, matRows, clotRows, params] = await Promise.all([
          db.listRh(), db.listMat(), db.listClot(), db.getParams(),
        ]);
        if (!alive) return;
        setRh(rhRows);
        setMat(matRows);
        setClotures(clotRows);
        if (params) {
          setRot({ departs: params.rotationDeparts || 0, effectif: params.rotationEffectif || 0 });
          if (Array.isArray(params.saisonnalite) && params.saisonnalite.length === 12) {
            setSaison(params.saisonnalite.map((x) => Number(x) || 0));
          }
        }
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, []);

  const paramsTimer = useRef(null);
  const persistParams = (nextRot, nextSaison) => {
    if (paramsTimer.current) clearTimeout(paramsTimer.current);
    paramsTimer.current = setTimeout(() => {
      db.saveParams({
        rotationDeparts: Number(nextRot.departs) || 0,
        rotationEffectif: Number(nextRot.effectif) || 0,
        saisonnalite: nextSaison.map((x) => Number(x) || 0),
      }).catch(() => {});
    }, 500);
  };

  const buckets = {};
  const get = (k) => (buckets[k] || (buckets[k] = { ca: 0, couverts: 0, heures: 0, ms: 0, caMat: 0, consoMat: 0, rh: 0, mat: 0 }));

  rh.forEach((e) => {
    if (!e.dateIso) return;
    const j = e.jours || [];
    const ca = j.reduce((s, d) => s + (Number(d.ca) || 0), 0);
    const cv = j.reduce((s, d) => s + (Number(d.couverts) || 0), 0);
    const h = j.reduce((s, d) => s + (Number(d.heures) || 0), 0);
    const b = get(e.dateIso.slice(0, 7));
    b.ca += ca; b.couverts += cv; b.heures += h; b.ms += h * (Number(e.coutH) || 0); b.rh++;
  });
  mat.forEach((e) => {
    if (!e.dateIso) return;
    const fam = e.familles || [];
    const caM = fam.reduce((s, f) => s + (Number(f.ca) || 0), 0);
    const consoM = fam.reduce((s, f) => s + ((Number(f.stockDebut) || 0) + (Number(f.achats) || 0) - (Number(f.stockFin) || 0)), 0);
    const b = get(e.dateIso.slice(0, 7));
    b.caMat += caM; b.consoMat += consoM; b.mat++;
  });

  const clotMap = {};
  clotures.forEach((c) => { if (c.mois) clotMap[c.mois] = c; });
  const margeOf = (k) => { const c = clotMap[k]; return c && Number(c.ca) > 0 ? (Number(c.resultatNet) / Number(c.ca)) * 100 : null; };

  const keys = Object.keys(buckets).sort();
  const moisCourt = (k) => { const [y, m] = k.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); };

  const rows = keys.map((k) => {
    const b = buckets[k];
    return {
      k, label: moisCourt(k), ca: b.ca, couverts: b.couverts,
      ticket: b.couverts > 0 ? b.ca / b.couverts : null,
      prod: b.heures > 0 ? b.ca / b.heures : null,
      msPct: b.ca > 0 ? (b.ms / b.ca) * 100 : null,
      foodCost: b.caMat > 0 ? (b.consoMat / b.caMat) * 100 : null,
      marge: margeOf(k),
    };
  });

  const T = keys.reduce((a, k) => { const b = buckets[k]; a.ca += b.ca; a.couverts += b.couverts; a.heures += b.heures; a.ms += b.ms; a.caMat += b.caMat; a.consoMat += b.consoMat; return a; }, { ca: 0, couverts: 0, heures: 0, ms: 0, caMat: 0, consoMat: 0 });
  const clotT = clotures.reduce((a, c) => { a.rn += Number(c.resultatNet) || 0; a.ca += Number(c.ca) || 0; return a; }, { rn: 0, ca: 0 });
  const ytd = {
    ca: T.ca, couverts: T.couverts,
    ticket: T.couverts > 0 ? T.ca / T.couverts : null,
    prod: T.heures > 0 ? T.ca / T.heures : null,
    msPct: T.ca > 0 ? (T.ms / T.ca) * 100 : null,
    foodCost: T.caMat > 0 ? (T.consoMat / T.caMat) * 100 : null,
    marge: clotT.ca > 0 ? (clotT.rn / clotT.ca) * 100 : null,
  };
  const nbMois = keys.length;
  const projLin = nbMois > 0 ? (T.ca / nbMois) * 12 : null;
  const sumSall = saison.reduce((a, b) => a + (Number(b) || 0), 0);
  const sumSobs = keys.reduce((a, k) => a + (Number(saison[Number(k.split("-")[1]) - 1]) || 0), 0);
  const projSaison = sumSobs > 0 ? (T.ca / sumSobs) * sumSall : projLin;
  const maxS = Math.max(...saison.map((x) => Number(x) || 0), 0.01);
  const setS = (i, v) => { const next = saison.map((x, j) => (j === i ? v : x)); setSaison(next); persistParams(rot, next); };
  const resetS = () => { setSaison([...SAISON_DEFAUT]); persistParams(rot, [...SAISON_DEFAUT]); };
  const rotPct = Number(rot.effectif) > 0 ? (Number(rot.departs) / Number(rot.effectif)) * 100 : null;

  const cell = (val, cible, dir, fmt) => {
    if (val == null || !isFinite(val)) return <td className="cell-mute">—</td>;
    const ok = dir === "low" ? val <= cible : val >= cible;
    return <td className={ok ? "cell-ok" : "cell-ko"}>{fmt(val)}</td>;
  };
  const eur0 = (v) => eur(v, 0);

  const ajouterClot = async () => {
    if (!cMois) return;
    const id = await db.upsertClot({ mois: cMois, ca: Number(cCA) || 0, resultatNet: Number(cRN) || 0 });
    const entry = { id, mois: cMois, ca: Number(cCA) || 0, resultatNet: Number(cRN) || 0 };
    const next = [entry, ...clotures.filter((c) => c.mois !== cMois)].sort((a, b) => (b.mois || "").localeCompare(a.mois || ""));
    setClotures(next); setCCA(""); setCRN("");
  };
  const supprClot = async (id) => { try { await db.removeClot(id); setClotures((cs) => cs.filter((c) => c.id !== id)); } catch (_) {} };
  const updRot = (key, v) => { const next = { ...rot, [key]: Number(v) || 0 }; setRot(next); persistParams(next, saison); };

  return (
    <div className="bilan fade-up">
      <div className="intro">
        <p className="eyebrow">Bilan consolidé</p>
        <h1 className="h1">L'année se construit, <i className="em">mois après mois</i>.</h1>
        <p className="lede">Ce bilan se remplit tout seul à partir de ce que vous saisissez dans RH au réel et Matière au réel. Pas de double saisie : chaque semaine, chaque inventaire vient nourrir la vue annuelle, décomposée par mois.</p>
      </div>

      {nbMois === 0 ? (
        <p className="hist-empty">Aucune donnée pour l'instant. Renseignez des semaines dans RH au réel et des périodes dans Matière au réel : le bilan se construira ici, mois après mois.</p>
      ) : (
        <>
          <div className="bilan-wrap">
            <table className="bilan-table">
              <thead>
                <tr><th>Mois</th><th>CA</th><th>Couverts</th><th>Ticket</th><th>Productivité</th><th>Masse sal.</th><th>Food cost</th><th>Marge nette</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.k}>
                    <td className="bilan-mois">{r.label}</td>
                    <td>{r.ca > 0 ? eur0(r.ca) : "—"}</td>
                    <td>{r.couverts > 0 ? fnum(r.couverts, 0) : "—"}</td>
                    {cell(r.ticket, TARGETS.ticket, "high", (v) => eur(v, 2))}
                    {cell(r.prod, TARGETS.productivite, "high", (v) => `${fnum(v, 0)} €/h`)}
                    {cell(r.msPct, TARGETS.masseSal, "low", (v) => `${fnum(v, 1)} %`)}
                    {cell(r.foodCost, TARGETS.foodCost, "low", (v) => `${fnum(v, 1)} %`)}
                    {cell(r.marge, TARGETS.margeNette, "high", (v) => `${fnum(v, 1)} %`)}
                  </tr>
                ))}
                <tr className="bilan-ytd">
                  <td className="bilan-mois">Cumul ({nbMois} mois)</td>
                  <td>{eur0(ytd.ca)}</td>
                  <td>{fnum(ytd.couverts, 0)}</td>
                  {cell(ytd.ticket, TARGETS.ticket, "high", (v) => eur(v, 2))}
                  {cell(ytd.prod, TARGETS.productivite, "high", (v) => `${fnum(v, 0)} €/h`)}
                  {cell(ytd.msPct, TARGETS.masseSal, "low", (v) => `${fnum(v, 1)} %`)}
                  {cell(ytd.foodCost, TARGETS.foodCost, "low", (v) => `${fnum(v, 1)} %`)}
                  {cell(ytd.marge, TARGETS.margeNette, "high", (v) => `${fnum(v, 1)} %`)}
                </tr>
              </tbody>
            </table>
          </div>

          {projSaison != null && (
            <p className="bilan-proj">Projection annuelle du CA, saisonnalisée : <b>{eur0(projSaison)}</b>. <button type="button" className="saison-toggle" onClick={() => setShowSais((v) => !v)}>{showSais ? "masquer la courbe" : "ajuster la saisonnalité"}</button><br /><span className="bilan-proj-sub">Au calcul linéaire, l'estimation serait de {eur0(projLin)}. L'écart entre les deux, c'est la saisonnalité de votre activité.</span></p>
          )}

          {showSais && (
            <div className="saison-box">
              <div className="saison-editor">
                {MOIS_ABBR.map((mn, i) => (
                  <div className="saison-cell" key={i}>
                    <div className="saison-bar-wrap"><div className="saison-bar" style={{ height: `${(Number(saison[i]) || 0) / maxS * 100}%` }} /></div>
                    <input className="saison-in" inputMode="decimal" value={saison[i]} onChange={(e) => setS(i, e.target.value)} />
                    <span className="saison-mn">{mn}</span>
                  </div>
                ))}
              </div>
              <div className="saison-foot">
                <span>1,00 = mois moyen. Au-dessus, un mois fort ; en dessous, un mois creux.</span>
                <button type="button" className="saison-reset" onClick={resetS}><RotateCcw size={13} /> Type brasserie</button>
              </div>
            </div>
          )}

          <section className="bilan-cloture">
            <div className="block-head"><h2 className="block-title">Compléter le bilan</h2><span className="block-sub">la part comptable, à votre rythme</span></div>
            <div className="clot-grid">
              <div className="clot-card">
                <h3 className="clot-h">Marge nette par mois</h3>
                <p className="clot-sub">Une clôture porte son propre CA et son résultat net. La marge nette du mois en découle, juste comptablement.</p>
                <div className="clot-form">
                  <label className="clot-f"><span>Mois</span><input type="month" value={cMois} onChange={(e) => setCMois(e.target.value)} /></label>
                  <label className="clot-f"><span>CA du mois</span><span className="clot-pin"><input inputMode="decimal" value={cCA} onChange={(e) => setCCA(e.target.value)} /><i>€</i></span></label>
                  <label className="clot-f"><span>Résultat net</span><span className="clot-pin"><input inputMode="decimal" value={cRN} onChange={(e) => setCRN(e.target.value)} /><i>€</i></span></label>
                  <button className="btn-ghost" onClick={ajouterClot} disabled={!cMois}><Save size={15} /> Ajouter</button>
                </div>
                {clotures.length > 0 && (
                  <ul className="clot-list">
                    {clotures.map((c) => (
                      <li key={c.id}>
                        <span className="clot-mois">{moisCourt(c.mois)}</span>
                        <span className="clot-val">{eur(c.ca, 0)} CA · {eur(c.resultatNet, 0)} net · {Number(c.ca) > 0 ? fnum(Number(c.resultatNet) / Number(c.ca) * 100, 1) : "0"} %</span>
                        <button className="clot-del" onClick={() => supprClot(c.id)} aria-label="Supprimer"><Trash2 size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="clot-card">
                <h3 className="clot-h">Rotation du personnel</h3>
                <p className="clot-sub">Une référence annuelle suffit : le turnover se lit sur douze mois, pas au mois.</p>
                <div className="clot-form">
                  <label className="clot-f"><span>Départs (12 mois)</span><input inputMode="decimal" value={rot.departs || ""} onChange={(e) => updRot("departs", e.target.value)} /></label>
                  <label className="clot-f"><span>Effectif moyen</span><input inputMode="decimal" value={rot.effectif || ""} onChange={(e) => updRot("effectif", e.target.value)} /></label>
                </div>
                {rotPct != null && (
                  <p className="clot-res">Rotation : <b style={{ color: rotPct <= TARGETS.rotation ? "var(--green)" : "var(--red)" }}>{fnum(rotPct, 1)} %</b> · cible ≤ {TARGETS.rotation} %</p>
                )}
              </div>
            </div>
          </section>

          <p className="disclaimer disclaimer-foot">Les leviers opérationnels se reconstituent depuis vos saisies. La marge nette et la rotation viennent de la clôture comptable et RH, que vous renseignez ci-dessus à votre rythme.</p>
        </>
      )}
    </div>
  );
}

/* ======================= CONNEXION ======================= */
function LoginGate({ onDone }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const libErr = (ex) => {
    const m = (ex && (ex.message || String(ex))) || "";
    if (/rate limit/i.test(m)) return "Limite d'envoi d'emails atteinte. Patientez une heure, puis réessayez.";
    if (/expired|invalid/i.test(m)) return "Code invalide ou expiré. Demandez un nouveau code.";
    if (/signups not allowed/i.test(m)) return "Les inscriptions sont désactivées côté Supabase.";
    return m || "Erreur inattendue. Réessayez.";
  };

  const envoyer = async () => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) { setErr("Adresse email invalide."); return; }
    setBusy(true); setErr("");
    try { await db.sendCode(e); setEmail(e); setCode(""); setStep("code"); }
    catch (ex) { setErr(libErr(ex)); }
    finally { setBusy(false); }
  };

  const valider = async () => {
    if (code.length < 6) { setErr("Le code comporte 6 chiffres."); return; }
    setBusy(true); setErr("");
    try { await db.verifyCode(email, code); await onDone(); }
    catch (ex) { setErr(libErr(ex)); setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-card">
        <p className="login-eyeb">Simulateur de performance CHR</p>
        <h1 className="login-t">Vos chiffres vous <i>suivent</i>.</h1>
        {step === "email" ? (
          <>
            <p className="login-d">Connectez-vous par email. Vous recevez un code à usage unique, sans mot de passe. Vos données se retrouvent sur tous vos appareils.</p>
            <label className="login-lab" htmlFor="lg-email">Adresse email</label>
            <input id="lg-email" className="login-in" type="email" inputMode="email" autoComplete="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") envoyer(); }} />
            <button className="login-btn" onClick={envoyer} disabled={busy}>{busy ? "Envoi…" : "Recevoir le code"}</button>
          </>
        ) : (
          <>
            <p className="login-d">Code envoyé à <b>{email}</b>. Consultez votre boîte de réception, puis saisissez le code ci-dessous.</p>
            <label className="login-lab" htmlFor="lg-code">Code à 6 chiffres</label>
            <input id="lg-code" className="login-in login-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") valider(); }} />
            <button className="login-btn" onClick={valider} disabled={busy}>{busy ? "Vérification…" : "Se connecter"}</button>
            <div className="login-alt">
              <button onClick={() => { setStep("email"); setErr(""); }} disabled={busy}>Changer d'email</button>
              <button onClick={envoyer} disabled={busy}>Renvoyer le code</button>
            </div>
          </>
        )}
        {err && <p className="login-err">{err}</p>}
      </div>
    </div>
  );
}

/* ======================= APP ======================= */
export default function App() {
  const theme = "noir";
  const [mode, setMode] = useState("annuel");
  const [view, setView] = useState("form");
  const [etab, setEtab] = useState("");
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [saved, setSaved] = useState(false);
  const [auth, setAuth] = useState("loading"); // loading | login | ready | error
  const [userEmail, setUserEmail] = useState(null);
  const [dbError, setDbError] = useState(null);

  const boot = async () => {
    try {
      const s = await db.init();
      if (!s.authenticated) { setAuth("login"); return; }
      setUserEmail(s.email);
      const rows = await db.listAnalyses();
      setHistorique(rows.map((r) => ({
        id: r.id,
        date: (r.donnees && r.donnees.date) || r.dateIso,
        inputs: r.donnees && r.donnees.inputs,
        scoreGlobal: r.score,
        caTotal: r.donnees && r.donnees.caTotal,
        bandLabel: r.donnees && r.donnees.bandLabel,
      })));
      setAuth("ready");
    } catch (e) {
      setDbError(e.message || String(e));
      setAuth("error");
    }
  };
  useEffect(() => { boot(); }, []);

  const deconnexion = async () => {
    await db.signOut();
    if (typeof window !== "undefined") window.location.reload();
  };

  const setField = (k, v) => setInputs((s) => ({ ...s, [k]: v }));
  const caTotalLive = num(inputs.caNourriture) + num(inputs.caBoissons);

  const analyser = () => {
    const r = compute(inputs);
    setPrevResult(result ? { scoreGlobal: result.scoreGlobal, kpis: Object.fromEntries(result.kpis.map((k) => [k.key, k.value])) } : null);
    setResult(r);
    setSaved(false);
    setView("result");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reset = () => { setInputs(DEFAULT_INPUTS); setResult(null); setPrevResult(null); setView("form"); };
  const sauvegarder = async () => {
    if (!result) return;
    const dateIso = new Date().toISOString();
    const donnees = { date: dateIso, inputs: { ...inputs }, caTotal: result.caTotal, bandLabel: result.band.label };
    try {
      const id = await db.addAnalyse({ dateIso: dateIso.slice(0, 10), donnees, score: result.scoreGlobal });
      const entry = { id, date: dateIso, inputs: { ...inputs }, scoreGlobal: result.scoreGlobal, caTotal: result.caTotal, bandLabel: result.band.label };
      setHistorique((h) => [entry, ...h]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setDbError(e.message || String(e)); setAuth("error");
    }
  };
  const charger = (entry) => {
    setInputs(entry.inputs); setPrevResult(null); setResult(compute(entry.inputs)); setView("result");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const supprimer = async (id) => {
    try { await db.removeAnalyse(id); setHistorique((h) => h.filter((e) => e.id !== id)); }
    catch (e) { setDbError(e.message || String(e)); setAuth("error"); }
  };

  const themeVars = THEMES[theme].vars;

  if (auth === "error") {
    return (
      <div className="rc-root" style={themeVars}>
        <style>{CSS}</style>
        <div className="boot"><div className="boot-card">
          <p className="boot-t">Connexion à la base impossible</p>
          <p className="boot-d">{dbError}</p>
          <p className="boot-d">Vérifiez votre connexion internet, puis rechargez la page.</p>
        </div></div>
      </div>
    );
  }
  if (auth === "loading") {
    return (
      <div className="rc-root" style={themeVars}>
        <style>{CSS}</style>
        <div className="boot"><div className="boot-card"><p className="boot-t">Connexion…</p></div></div>
      </div>
    );
  }
  if (auth === "login") {
    return (
      <div className="rc-root" style={themeVars}>
        <style>{CSS}</style>
        <LoginGate onDone={boot} />
      </div>
    );
  }

  return (
    <div className="rc-root" style={themeVars}>
      <style>{CSS}</style>

      <header className="topbar">
        <div className="brand">
          <span className="brand-name">R&amp;C Pilotage</span>
          <span className="brand-sub">Diagnostic &amp; pilotage d'exploitation</span>
        </div>
        <div className="modes">
          <button className={`mode-pill ${mode === "annuel" ? "on" : ""}`} onClick={() => setMode("annuel")}>Vue annuelle</button>
          <button className={`mode-pill ${mode === "granulaire" ? "on" : ""}`} onClick={() => setMode("granulaire")}>RH au réel</button>
          <button className={`mode-pill ${mode === "matiere" ? "on" : ""}`} onClick={() => setMode("matiere")}>Matière au réel</button>
          <button className={`mode-pill ${mode === "bilan" ? "on" : ""}`} onClick={() => setMode("bilan")}>Bilan annuel</button>
        </div>
        <div className="hdr-right">
          <button className="histo-btn" onClick={() => { setMode("annuel"); setView("historique"); }}>
            <Clock size={14} /> Historique{historique.length > 0 ? ` (${historique.length})` : ""}
          </button>
          <button className="histo-btn hdr-out" title={userEmail ? `Connecté : ${userEmail}. Se déconnecter de cet appareil.` : "Se déconnecter"} onClick={deconnexion}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {mode === "annuel" && view === "form" && (
        <main className="wrap">
          <div className="intro fade-up">
            <p className="eyebrow">Diagnostic d'exploitation</p>
            <h1 className="h1">La moyenne rassure. <i className="em">L'écart décide.</i></h1>
            <p className="lede">Renseignez vos chiffres sur douze mois. Chaque indicateur est lu contre sa cible métier : c'est l'écart qui parle, pas la moyenne. Vous repartez avec un diagnostic chiffré et les actions à mener en priorité.</p>
          </div>

          <div className="form-card fade-up" style={{ animationDelay: "60ms" }}>
            {FIELD_GROUPS.map((g) => (
              <section key={g.title} className="form-group">
                <h2 className="group-title">{g.title}</h2>
                <div className="grid-fields">
                  {g.fields.map((def) => (
                    <Field key={def.k} def={def} value={inputs[def.k]} onChange={setField} />
                  ))}
                </div>
                {g.title.startsWith("Activité") && (
                  <div className="catotal">Chiffre d'affaires total <b>{eur(caTotalLive)}</b></div>
                )}
              </section>
            ))}

            <div className="form-actions">
              <button className="btn-ghost" onClick={reset}>Réinitialiser</button>
              <button className="btn-primary" onClick={analyser}>
                Analyser mon exploitation <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <p className="disclaimer disclaimer-foot">Les références utilisées (food cost ≤ 30 %, masse salariale ≤ 33 %, marge nette ≥ 10 %…) sont des repères de gestion CHR ; elles s'ajustent selon le concept et le positionnement.</p>
        </main>
      )}

      {mode === "annuel" && view === "result" && result && (
        <main className="wrap">
          <div className="report-head">
            <div className="report-brand">
              <span className="report-wordmark">R&amp;C Pilotage</span>
              <span className="report-sub">Diagnostic de performance · CHR</span>
            </div>
            <div className="report-meta">
              <span className="report-etab">{etab || "Établissement"}</span>
              <span className="report-date">{new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>
            </div>
          </div>

          <button className="back" onClick={() => setView("form")}><ArrowLeft size={15} /> Modifier les données</button>

          <section className="verdict fade-up">
            <div className="verdict-left">
              <p className="eyebrow">Synthèse dirigeant</p>
              <div className="verdict-band">{result.band.label}</div>
              <p className="verdict-text">{result.synthese}</p>
              <div className="verdict-figs">
                <div className="vfig">
                  <span className="vfig-label">Marge à reconquérir / an</span>
                  <span className="vfig-num" style={{ color: result.totalMargeLeak > 0 ? "var(--red)" : "var(--green)" }}>
                    {result.totalMargeLeak > 0 ? eur(result.totalMargeLeak) : "Maîtrisée"}
                  </span>
                </div>
                {result.totalRevenu > 0 && (
                  <div className="vfig">
                    <span className="vfig-label">CA additionnel possible / an</span>
                    <span className="vfig-num" style={{ color: "var(--text)" }}>{eur(result.totalRevenu)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="verdict-right">
              <ScoreGauge score={result.scoreGlobal} />
              <p className="gauge-cap">Score global pondéré</p>
              {prevResult && (
                <p className="gauge-delta" style={{ color: result.scoreGlobal >= prevResult.scoreGlobal ? "var(--green)" : "var(--red)" }}>
                  {result.scoreGlobal >= prevResult.scoreGlobal ? "▲" : "▼"} {Math.abs(result.scoreGlobal - prevResult.scoreGlobal)} pt(s) vs analyse précédente
                </p>
              )}
            </div>
          </section>

          <section className="block">
            <div className="block-head"><h2 className="block-title">Indicateurs clés</h2><span className="block-sub">valeur · objectif · écart</span></div>
            <div className="kpi-layout">
              <div className="kpi-grid">
                {result.kpis.map((k, idx) => (
                  <KpiCard key={k.key} kpi={k} delay={idx * 60} prev={prevResult ? prevResult.kpis[k.key] : null} />
                ))}
              </div>
              <div className="radar-card fade-up">
                <h3 className="radar-title">Profil de performance</h3>
                <Radar kpis={result.kpis} />
                <p className="radar-foot">Aire = niveau atteint sur chaque levier (note /100). Point vert s'il tient sa cible, rouge sinon.</p>
              </div>
            </div>
          </section>

          <section className="block">
            <div className="strip">
              {result.complementaires.map((c) => (
                <div key={c.label} className="strip-item">
                  <span className="strip-val">{c.value}</span>
                  <span className="strip-lbl">{c.label}</span>
                  <span className="strip-sub">{c.sub}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Pilotage par cadence */}
          <section className="block">
            <div className="block-head"><h2 className="block-title">Pilotage par cadence</h2><span className="block-sub">chaque indicateur à son rythme</span></div>
            <div className="cadences">
              {result.cadences.map((c) => (
                <div className="cad" key={c.cadence}>
                  <div className="cad-head">
                    <span className="cad-titre">{c.cadence}</span>
                    <span className="cad-ctx">{c.contexte}</span>
                  </div>
                  <div className="cad-lignes">
                    {c.lignes.map((l) => (
                      <div className="cad-ligne" key={l.label}>
                        <span className="cad-label">{l.label}</span>
                        <span className="cad-val">{l.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Points d'appui */}
          {result.appuis.length > 0 && (
            <section className="block">
              <div className="block-head"><h2 className="block-title">Points d'appui</h2><span className="block-sub">ce qui tient, et sur quoi construire</span></div>
              <div className="appuis">
                {result.appuis.map((a) => (
                  <div key={a.key} className="appui">
                    <span className="appui-dot" />
                    <div className="appui-body">
                      <div className="appui-head">
                        <span className="appui-titre">{a.titre}</span>
                        <span className="appui-val">{a.valTxt} · cible {a.cibleTxt}</span>
                      </div>
                      <p className="appui-txt">{a.apport}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Lecture croisée */}
          {(result.signaux.length + result.signauxPlus.length) > 0 && (
            <section className="block">
              <div className="block-head"><h2 className="block-title">Lecture croisée</h2><span className="block-sub">ce que les indicateurs disent ensemble</span></div>
              <div className="signaux">
                {result.signauxPlus.map((s) => (
                  <div key={s.titre} className="signal signal-plus">
                    <span className="signal-titre">{s.titre}</span>
                    <p className="signal-msg">{s.message}</p>
                  </div>
                ))}
                {result.signaux.map((s) => (
                  <div key={s.titre} className="signal">
                    <span className="signal-titre">{s.titre}</span>
                    <p className="signal-msg">{s.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.impacts.length > 0 && (
            <section className="block">
              <div className="block-head"><h2 className="block-title">Estimation financière des écarts</h2></div>
              <div className="impacts">
                {result.impacts.map((x) => (
                  <div key={x.key} className={"impact " + (x.nature === "revenu" ? "impact-rev" : x.nature === "contexte" ? "impact-ctx" : "impact-marge")}>
                    <div className="impact-top">
                      <span className="impact-label">{x.label}</span>
                      <span className="impact-amount" style={{ color: x.nature === "revenu" ? "var(--text)" : x.nature === "contexte" ? "var(--muted)" : "var(--red)" }}>
                        {x.nature === "revenu" ? "+ " : x.nature === "marge" ? "− " : ""}{eur(x.amount)}<span className="impact-per">/an</span>
                      </span>
                    </div>
                    <p className="impact-note">{x.note}</p>
                  </div>
                ))}
              </div>
              <p className="disclaimer">Estimations indicatives, destinées à prioriser les actions. Elles ne se substituent pas à une analyse comptable détaillée et ne sont pas cumulables entre elles.</p>
            </section>
          )}

          {result.plan.length > 0 && (
            <section className="block">
              <div className="block-head"><h2 className="block-title">Plan d'action priorisé</h2></div>
              <div className="plan">
                {result.plan.map((p) => (
                  <article key={p.key} className="prio">
                    <div className="prio-rank">P{p.priorite}</div>
                    <div className="prio-body">
                      <h3 className="prio-title">{p.titre}</h3>
                      <p className="prio-why">{p.pourquoi}</p>
                      <ul className="prio-leviers">
                        {p.leviers.map((l, idx) => <li key={idx}>{l}</li>)}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
              {result.appuis.length > 0 && (
                <p className="preserver">À préserver pendant les corrections : {result.appuis.slice(0, 3).map((a) => a.titre.toLowerCase()).join(", ")}. On corrige les écarts sans casser ce qui marche déjà.</p>
              )}
            </section>
          )}

          {result.plan.length === 0 && (
            <section className="block">
              <div className="allgood">Tous les indicateurs sont dans les références métier. L'enjeu devient le maintien : suivi régulier et consolidation des marges.</div>
            </section>
          )}

          <div className="report-name no-print">
            <label htmlFor="etab">Établissement</label>
            <input id="etab" className="etab-in" placeholder="Nom (apparaît sur le rapport PDF)" value={etab} onChange={(e) => setEtab(e.target.value)} spellCheck="false" />
          </div>

          <div className="result-actions no-print">
            <button className="btn-ghost" onClick={sauvegarder}><Save size={16} /> {saved ? "Enregistré ✓" : "Enregistrer l'analyse"}</button>
            <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} /> Exporter le rapport (PDF)</button>
            <button className="btn-ghost" onClick={() => setView("form")}><RotateCcw size={16} /> Nouvelle analyse</button>
          </div>

          <div className="report-foot">R&amp;C Pilotage · rcpilotage.fr · Diagnostic indicatif établi à partir des données déclarées par l'exploitant. Il ne remplace pas une comptabilité certifiée.</div>

          <footer className="foot">R&amp;C Pilotage · <i>Un établissement ne se subit pas. Il se pilote.</i></footer>
        </main>
      )}

      {mode === "annuel" && view === "historique" && (
        <main className="wrap">
          <button className="back" onClick={() => setView(result ? "result" : "form")}><ArrowLeft size={15} /> Retour</button>
          <div className="block-head"><h2 className="block-title">Historique des analyses</h2><span className="block-sub">{historique.length} enregistrée(s)</span></div>
          {historique.length === 0 ? (
            <p className="disclaimer">Aucune analyse enregistrée. Lancez une analyse, puis cliquez sur « Enregistrer l'analyse » pour la retrouver ici et suivre votre évolution dans le temps.</p>
          ) : (
            <div className="histo">
              {historique.map((e) => (
                <div key={e.id} className="histo-row">
                  <div className="histo-meta">
                    <span className="histo-date">{new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>
                    <span className="histo-sub">{eur(e.caTotal)} de CA · {e.bandLabel}</span>
                  </div>
                  <span className="histo-score">{e.scoreGlobal}<small> /100</small></span>
                  <div className="histo-actions">
                    <button className="btn-ghost" onClick={() => charger(e)}>Charger</button>
                    <button className="histo-del" onClick={() => supprimer(e.id)} aria-label="Supprimer"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {mode === "granulaire" && (<main className="wrap"><RHReel /></main>)}
      {mode === "matiere" && (<main className="wrap"><MatiereReel /></main>)}
      {mode === "bilan" && (<main className="wrap"><BilanAnnuel /></main>)}
    </div>
  );
}

/* ============================ CSS ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap');

.rc-root *{box-sizing:border-box;margin:0;padding:0}
.rc-root{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:var(--bg);color:var(--text);min-height:100vh;
  -webkit-font-smoothing:antialiased;letter-spacing:.005em;
  font-variant-numeric:tabular-nums;
}
.rc-root b{font-weight:600}
.serif{font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif}

.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;
  padding:18px 28px;border-bottom:1px solid var(--border);background:var(--bg2);position:sticky;top:0;z-index:20}
.brand{display:flex;flex-direction:column;gap:4px}
.brand-name{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:23px;letter-spacing:.01em;color:var(--text);line-height:1}
.brand-sub{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);font-weight:500}
.theme-switch{display:flex;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:4px}
.theme-btn{font-family:inherit;font-size:11.5px;color:var(--muted);background:transparent;border:0;border-radius:6px;
  padding:6px 11px;cursor:pointer;transition:all .18s;white-space:nowrap}
.theme-btn:hover{color:var(--text)}
.theme-btn.on{background:var(--surface2);color:var(--text);box-shadow:0 1px 3px var(--shadow)}

.wrap{max-width:1080px;margin:0 auto;padding:40px 28px 80px}
.eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);font-weight:500;margin-bottom:14px}
.h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:clamp(30px,5vw,46px);line-height:1.04;letter-spacing:-.01em;margin:0 auto 16px;max-width:18ch;color:var(--text)}
.h1 .em{font-style:italic;font-weight:500}
.lede{color:var(--muted);font-size:15.5px;line-height:1.6;max-width:62ch;margin:0 auto}
.intro{margin-bottom:34px;text-align:center}

.form-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:30px;box-shadow:0 8px 30px var(--shadow)}
.form-group{padding:22px 0;border-bottom:1px solid var(--border)}
.form-group:first-child{padding-top:0}
.group-title{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:18px}
.grid-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.field{display:flex;flex-direction:column;gap:7px}
.field-label{font-size:13px;color:var(--text);font-weight:400;text-align:left}
.field-input{display:flex;align-items:center;background:var(--bg2);border:1px solid var(--border2);border-radius:9px;
  padding:0 12px;transition:border-color .16s,box-shadow .16s}
.field-input:focus-within{border-color:var(--text);box-shadow:0 0 0 2px var(--border2)}
.field-input input{flex:1;background:transparent;border:0;outline:none;color:var(--text);font-family:inherit;
  font-size:15px;font-weight:500;padding:11px 0;min-width:0;font-variant-numeric:tabular-nums}
.field-unit{font-size:12px;color:var(--faint);padding-left:8px;white-space:nowrap}
.catotal{margin-top:16px;font-size:13px;color:var(--muted);display:flex;justify-content:flex-end;gap:8px;align-items:baseline}
.catotal b{font-size:17px;color:var(--text);font-weight:600}

.form-actions{display:flex;justify-content:space-between;align-items:center;gap:14px;padding-top:26px;flex-wrap:wrap}
.btn-primary{display:inline-flex;align-items:center;gap:9px;font-family:inherit;font-size:14.5px;font-weight:600;
  color:var(--bg);background:var(--text);border:0;border-radius:10px;padding:14px 24px;cursor:pointer;
  transition:transform .14s,opacity .14s;letter-spacing:.01em}
.btn-primary:hover{transform:translateY(-1px);opacity:.92}
.btn-primary:active{transform:translateY(0)}
.btn-ghost{display:inline-flex;align-items:center;gap:8px;font-family:inherit;font-size:13.5px;font-weight:500;
  color:var(--muted);background:transparent;border:1px solid var(--border2);border-radius:10px;padding:12px 18px;cursor:pointer;transition:all .16s}
.btn-ghost:hover{color:var(--text);border-color:var(--text)}
.disclaimer{font-size:12px;color:var(--faint);line-height:1.55;margin-top:18px;max-width:56ch;text-align:center;margin-left:auto;margin-right:auto}
.disclaimer-foot{text-align:center;margin-left:auto;margin-right:auto}

.back{display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:13px;color:var(--muted);
  background:transparent;border:0;cursor:pointer;margin-bottom:24px;transition:color .16s}
.back:hover{color:var(--text)}

.verdict{display:grid;grid-template-columns:1.5fr 1fr;gap:30px;align-items:center;
  background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:34px;box-shadow:0 10px 40px var(--shadow);margin-bottom:28px}
.verdict-band{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:38px;letter-spacing:-.01em;line-height:1;margin-bottom:14px;color:var(--text)}
.verdict-text{color:var(--muted);font-size:15px;line-height:1.62;max-width:46ch;text-align:center;margin-left:auto;margin-right:auto}
.verdict-figs{display:flex;gap:30px;flex-wrap:wrap;margin-top:22px;padding-top:22px;border-top:1px solid var(--border)}
.vfig{display:flex;flex-direction:column;gap:5px}
.vfig-label{font-size:11.5px;letter-spacing:.05em;color:var(--faint);text-transform:uppercase}
.vfig-num{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:27px;line-height:1;color:var(--text)}
.verdict-right{display:flex;flex-direction:column;align-items:center;gap:4px}
.gauge{width:210px;height:auto}
.gauge-num{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:46px;fill:var(--text)}
.gauge-sub{font-size:11px;fill:var(--faint);letter-spacing:.05em}
.gauge-cap{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:2px}
.gauge-delta{font-size:12px;margin-top:6px;font-weight:500}

.block{margin-bottom:34px}
.block-head{display:flex;align-items:baseline;justify-content:center;gap:14px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.block-title{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:25px;letter-spacing:-.005em;color:var(--text)}
.block-sub{font-size:12px;color:var(--faint);letter-spacing:.04em}

.kpi-layout{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;align-items:start}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:18px}
.kpi-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}
.kpi-head-r{display:inline-flex;align-items:center;gap:9px}
.kpi-info-wrap{position:relative;display:inline-flex;align-items:center}
.kpi-info{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;background:transparent;color:var(--faint);cursor:pointer;border-radius:50%;transition:color .16s}
.kpi-info:hover,.kpi-info:focus-visible{color:var(--text);outline:none}
.kpi-tip{position:absolute;top:25px;right:-2px;width:min(252px,76vw);background:var(--surface2);border:1px solid var(--border2);border-radius:11px;padding:12px 14px;display:flex;flex-direction:column;gap:7px;z-index:30;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .15s,transform .15s,visibility .15s;box-shadow:0 14px 34px rgba(0,0,0,.45);text-align:left;pointer-events:none}
.kpi-info-wrap:hover .kpi-tip,.kpi-info-wrap:focus-within .kpi-tip{opacity:1;visibility:visible;transform:translateY(0);pointer-events:auto}
.kpi-tip-def{font-size:12.5px;color:var(--text);line-height:1.5}
.kpi-tip-seuil{font-size:12px;color:var(--muted);line-height:1.5}
.kpi-name{font-size:11px;color:var(--muted);font-weight:500;letter-spacing:.16em;text-transform:uppercase}
.dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--faint)}
.kpi.good .dot{background:var(--green);box-shadow:0 0 0 4px var(--green-bg)}
.kpi.bad .dot{background:var(--red);box-shadow:0 0 0 4px var(--red-bg)}
.kpi-value{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:34px;line-height:1;margin-bottom:12px;color:var(--text)}
.kpi-meta{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--muted);margin-bottom:14px}
.kpi-meta b{color:var(--text)}
.ecart-ok{color:var(--green);font-weight:600}
.ecart-ko{color:var(--red);font-weight:600}
.kpi-delta{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:500;margin-top:10px}

.rangebar{margin-top:2px}
.rangebar-track{position:relative;height:7px;background:var(--bg2);border-radius:5px;border:1px solid var(--border)}
.rangebar-good{position:absolute;top:0;bottom:0;background:var(--border);border-radius:5px}
.rangebar-tgt{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--border2);transform:translateX(-1px)}
.rangebar-marker{position:absolute;top:50%;width:11px;height:11px;border-radius:50%;border:2px solid;
  transform:translate(-50%,-50%);box-shadow:0 1px 3px var(--shadow)}
.rangebar-scale{display:flex;justify-content:space-between;font-size:10px;color:var(--faint);margin-top:6px}

.radar-card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:18px 16px 14px;text-align:center}
.radar-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:6px}
.radar{width:100%;max-width:280px;height:auto}
.radar-lbl{font-size:9.5px;fill:var(--muted);font-family:'Inter',sans-serif;font-weight:500}
.radar-foot{font-size:11px;color:var(--faint);line-height:1.4;margin-top:4px}

.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0;background:var(--surface);
  border:1px solid var(--border);border-radius:13px;overflow:hidden}
.strip-item{padding:18px 20px;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:4px}
.strip-item:last-child{border-right:0}
.strip-val{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:24px;line-height:1;color:var(--text)}
.strip-lbl{font-size:12.5px;color:var(--text);font-weight:500;margin-top:3px}
.strip-sub{font-size:11px;color:var(--faint)}


.modes{display:flex;justify-content:center;gap:8px;padding:20px 20px 0}
.mode-pill{font-family:inherit;font-size:13px;color:var(--muted);background:transparent;border:1px solid var(--border);border-radius:999px;padding:8px 18px;cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.mode-pill:hover{color:var(--text);border-color:var(--border2)}
.mode-pill.on{color:var(--bg);background:var(--text);border-color:var(--text);font-weight:500}
.rh{max-width:920px;margin:0 auto;padding:6px 0 40px}
.rh-params{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin:0 auto 24px}
.rh-param{display:flex;flex-direction:column;gap:7px}
.rh-param>span:first-child{font-size:12px;color:var(--muted);text-align:left}
.rh-pin{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:0 14px}
.rh-pin input{width:80px;background:transparent;border:0;outline:0;color:var(--text);font-family:inherit;font-size:16px;padding:12px 0}
.rh-pin i{font-style:normal;font-size:12px;color:var(--faint)}
.rh-tablewrap{overflow-x:auto}
.rh-table{min-width:640px;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.rh-row{display:grid;grid-template-columns:1.1fr .95fr .7fr .8fr .85fr .95fr 1fr;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border)}
.rh-row:last-child{border-bottom:0}
.rh-head{background:var(--surface2);padding-top:12px;padding-bottom:12px}
.rh-head span{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:right}
.rh-head span:first-child{text-align:left}
.rh-jour{font-size:13.5px;color:var(--text);font-weight:500}
.rh-cell input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:inherit;font-size:14px;padding:9px 10px;text-align:right;outline:0}
.rh-cell input:focus{border-color:var(--border2)}
.rh-cell-r{text-align:right;font-size:14px;color:var(--text);font-variant-numeric:tabular-nums}
.rh-out{text-align:right;font-size:14px;color:var(--muted);font-variant-numeric:tabular-nums}
.rh-out.good{color:var(--green)}
.rh-out.bad{color:var(--red)}
.rh-foot{background:var(--surface2)}
.rh-foot .rh-jour,.rh-foot .rh-cell-r,.rh-foot .rh-out{font-weight:600}
.rh-synth{margin-top:20px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 24px;display:flex;flex-wrap:wrap;gap:24px;align-items:baseline}
.rh-synth-fig{display:flex;flex-direction:column;gap:3px}
.rh-synth-val{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:var(--red);line-height:1}
.rh-synth-lab{font-size:12px;color:var(--muted)}
.rh-synth-txt{flex:1;min-width:240px;font-size:13.5px;line-height:1.6;color:var(--muted);margin:0;text-align:left}

.cadences{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.cad{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:18px 20px}
.cad-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:14px;padding-bottom:11px;border-bottom:1px solid var(--border)}
.cad-titre{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600}
.cad-ctx{font-size:11px;color:var(--faint);font-style:italic}
.cad-lignes{display:flex;flex-direction:column;gap:10px}
.cad-ligne{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.cad-label{font-size:13px;color:var(--muted)}
.cad-val{font-size:15px;color:var(--text);font-weight:500;font-variant-numeric:tabular-nums;text-align:right}
@media(max-width:560px){.cad{padding:15px 16px}}

.signaux{display:flex;flex-direction:column;gap:12px}
.signal{background:var(--surface);border:1px solid var(--border);border-left:2px solid var(--border2);border-radius:12px;padding:18px 20px;text-align:center}
.signal-titre{display:block;font-family:'Cormorant Garamond',serif;font-weight:600;font-size:19px;margin-bottom:6px;color:var(--text);text-align:center}
.signal-msg{font-size:13.5px;color:var(--muted);line-height:1.6;max-width:42ch;text-align:center;margin-left:auto;margin-right:auto}
.signal-plus{border-left-color:var(--green)}
.signal-plus .signal-titre{color:var(--green)}

.appuis{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:14px}
.appui{position:relative;background:var(--surface);border:1px solid var(--border);border-left:2px solid var(--green);border-radius:12px;padding:16px 18px}
.appui-dot{position:absolute;top:19px;left:18px;width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(62,143,102,.18)}
.appui-body{text-align:center}
.appui-head{display:flex;flex-direction:column;align-items:center;gap:5px;margin-bottom:8px}
.appui-titre{font-size:14.5px;font-weight:600;color:var(--text);text-align:center}
.appui-val{font-size:11.5px;color:var(--green);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:center}
.appui-txt{font-size:13px;color:var(--muted);line-height:1.55;margin:0 auto;text-align:center;max-width:34ch}

.preserver{font-size:13px;color:var(--muted);line-height:1.55;margin:20px 0 0;padding-top:16px;border-top:1px solid var(--border);text-align:center}

.impacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.impact{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;border-left:2px solid var(--border2);text-align:center}
.impact-marge{border-left-color:var(--border2)}
.impact-rev{border-left-color:var(--border2)}
.impact-ctx{border-left-color:var(--border2)}
.impact-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px}
.impact-label{font-size:13.5px;font-weight:500;color:var(--text);text-align:center}
.impact-amount{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:24px;line-height:1;white-space:nowrap}
.impact-per{font-family:'Inter',sans-serif;font-size:11px;color:var(--faint);font-weight:400;margin-left:3px}
.impact-note{font-size:12px;color:var(--muted);line-height:1.5;text-align:center;max-width:34ch;margin-left:auto;margin-right:auto}

.plan{display:flex;flex-direction:column;gap:14px}
.prio{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:22px;text-align:center}
.prio-rank{position:absolute;top:22px;left:22px;font-family:'Cormorant Garamond',serif;font-weight:600;font-size:22px;color:var(--text);
  border:1px solid var(--border2);border-radius:9px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.prio-body{text-align:center}
.prio-title{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:21px;margin-bottom:7px;color:var(--text);text-align:center}
.prio-why{font-size:13.5px;color:var(--muted);line-height:1.58;margin-bottom:14px;max-width:42ch;text-align:center;margin-left:auto;margin-right:auto}
.prio-leviers{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:7px 22px;max-width:600px;margin-left:auto;margin-right:auto}
.prio-leviers li{font-size:12.5px;color:var(--text);padding-left:16px;position:relative;line-height:1.5;text-align:left}
.prio-leviers li:before{content:"";position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:50%;background:var(--faint)}

.allgood{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:22px;color:var(--text);font-size:14px;line-height:1.6}

.result-actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
.histo-btn{display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:13px;font-weight:500;color:var(--muted);background:transparent;border:1px solid var(--border2);border-radius:9px;padding:9px 15px;cursor:pointer;transition:all .16s;white-space:nowrap}
.histo-btn:hover{color:var(--text);border-color:var(--text)}
.histo{display:flex;flex-direction:column;gap:10px}
.histo-row{display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px}
.histo-meta{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0}
.histo-date{font-weight:500;color:var(--text);font-size:14px}
.histo-sub{font-size:12.5px;color:var(--muted)}
.histo-score{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:26px;color:var(--text);white-space:nowrap}
.histo-score small{font-family:'Inter',sans-serif;font-size:11px;color:var(--faint);font-weight:400}
.histo-actions{display:flex;align-items:center;gap:8px}
.histo-del{background:transparent;border:0;color:var(--faint);cursor:pointer;padding:8px;border-radius:8px;display:flex;transition:color .16s}
.histo-del:hover{color:var(--text)}
@media(max-width:560px){.histo-row{flex-wrap:wrap;gap:10px}.histo-score{font-size:22px}}
.foot{margin-top:40px;padding-top:22px;border-top:1px solid var(--border);font-size:12.5px;color:var(--faint);text-align:center}
.foot i{color:var(--muted)}

.fade-up{animation:fadeUp .55s cubic-bezier(.2,.7,.3,1) both}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.fade-up{animation:none}}

@media(max-width:860px){
  .verdict{grid-template-columns:1fr;text-align:center}
  .verdict-text{margin:0 auto}.verdict-figs{justify-content:center}
  .kpi-layout{grid-template-columns:1fr}
  .radar-card{order:-1}
}
@media(max-width:560px){
  .wrap{padding:28px 18px 60px}.topbar{padding:14px 18px}
  .form-card{padding:20px}.verdict{padding:24px}
  .theme-btn{padding:6px 8px;font-size:11px}
}

.report-head,.report-foot{display:none}
.report-name{display:flex;align-items:center;gap:12px;max-width:880px;margin:0 auto 14px;flex-wrap:wrap}
.report-name label{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.etab-in{flex:1;min-width:220px;font-family:inherit;font-size:14px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 14px;outline:0}
.etab-in:focus{border-color:var(--border2)}

@media print{
  @page{margin:1.4cm}
  .no-print,.theme-switch,.back,.result-actions,.report-name,.modes,.topbar,.foot,.histo-btn,.kpi-info{display:none!important}
  .rc-root{background:#fff!important;color:#111!important;
    --bg:#fff;--bg2:#fff;--surface:#fff;--surface2:#fff;--border:#ccc;--border2:#bbb;--text:#111;--muted:#444;--faint:#777}
  .wrap{padding-top:0!important}
  .report-head{display:flex!important;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1.5px solid #111;padding-bottom:12px;margin-bottom:24px}
  .report-wordmark{font-family:'Cormorant Garamond',serif;font-size:23px;font-weight:600;color:#111;display:block;line-height:1.1}
  .report-sub{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#555}
  .report-meta{text-align:right}
  .report-etab{display:block;font-size:15px;font-weight:600;color:#111}
  .report-date{font-size:11px;color:#666}
  .report-foot{display:block!important;margin-top:26px;padding-top:10px;border-top:1px solid #ccc;font-size:9px;color:#777;text-align:center;line-height:1.5}
  .form-card,.verdict,.kpi,.radar-card,.strip,.impact,.prio,.block{box-shadow:none!important;break-inside:avoid}
  .verdict{border:1px solid #ddd}
}

/* Matière au réel (granulaire) */
.mat{max-width:920px;margin:0 auto;padding:6px 0 40px}
.mat-periode{display:flex;gap:8px;justify-content:center;margin:0 auto 22px}
.mat-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.mat-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.mat-card-head{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--text);font-weight:600;padding:14px 18px;background:var(--surface2);border-bottom:1px solid var(--border)}
.mat-fields{display:flex;flex-direction:column;gap:10px;padding:16px 18px}
.mat-f{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mat-f>span:first-child{font-size:13px;color:var(--muted)}
.mat-in{display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:0 10px}
.mat-in input{width:90px;background:transparent;border:0;outline:0;color:var(--text);font-family:inherit;font-size:14px;padding:8px 0;text-align:right}
.mat-in i{font-style:normal;font-size:12px;color:var(--faint)}
.mat-result{border-top:1px solid var(--border);padding:14px 18px;display:flex;flex-direction:column;gap:9px}
.mat-r-line{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13.5px}
.mat-r-line>span:first-child{color:var(--muted)}
.mat-r-line>span:last-child{color:var(--text);font-variant-numeric:tabular-nums;font-weight:500}
.mat-r-line .good{color:var(--green)}
.mat-r-line .bad{color:var(--red)}

/* Historiques granulaires (RH + matière) */
.hist-block{max-width:920px;margin:22px auto 0;border-top:1px solid var(--border);padding-top:20px}
.hist-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.hist-title{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600}
.hist-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.hist-date-in{font-family:inherit;font-size:13px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:8px 12px;outline:0;color-scheme:dark}
.hist-date-in:focus{border-color:var(--border2)}
.hist-periode{font-size:12.5px;color:var(--faint);font-style:italic}
.trend{margin-bottom:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px}
.trend-svg{width:100%;height:90px;display:block}
.trend-area{fill:var(--text);opacity:.06}
.trend-line{fill:none;stroke:var(--text);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.trend-foot{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:10px}
.trend-now{font-size:15px;color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.trend-delta{font-size:12.5px;font-variant-numeric:tabular-nums}
.trend-delta.good{color:var(--green)}
.trend-delta.bad{color:var(--red)}
.trend-avgs{display:flex;gap:22px;flex-wrap:wrap;margin-top:11px;padding-top:11px;border-top:1px solid var(--border)}
.trend-avg{font-size:12.5px;color:var(--muted)}
.trend-avg b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.hist-save{display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:13px;color:var(--bg);background:var(--text);border:0;border-radius:999px;padding:9px 16px;cursor:pointer;transition:opacity .15s}
.hist-save:hover{opacity:.85}
.hist-empty{font-size:13px;color:var(--faint);margin:0;line-height:1.5}
.boot{min-height:62vh;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.boot-card{max-width:460px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:30px 28px}
.boot-t{font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--text);margin:0 0 10px}
.boot-d{font-size:13.5px;color:var(--muted);line-height:1.6;margin:7px 0 0;word-break:break-word}
.hdr-right{display:flex;align-items:center;gap:8px}
.hdr-out{padding:9px 11px}
.login{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:44px 20px}
.login-card{width:100%;max-width:420px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:34px 30px}
.login-eyeb{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin:0 0 12px}
.login-t{font-family:'Cormorant Garamond',serif;font-size:30px;line-height:1.12;font-weight:600;color:var(--text);margin:0 0 12px}
.login-d{font-size:13.5px;color:var(--muted);line-height:1.65;margin:0 0 18px}
.login-d b{color:var(--text);font-weight:600}
.login-lab{display:block;font-size:12px;color:var(--muted);margin:0 0 6px}
.login-in{width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;color:var(--text);font-size:15px;outline:none;font-family:inherit}
.login-in:focus{border-color:var(--muted)}
.login-code{letter-spacing:8px;font-size:20px;text-align:center;font-variant-numeric:tabular-nums}
.login-btn{width:100%;margin-top:14px;background:var(--text);color:var(--bg);border:none;border-radius:10px;padding:12px 14px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
.login-btn:disabled{opacity:.55;cursor:default}
.login-err{color:var(--red);font-size:13px;margin:12px 0 0;line-height:1.5}
.login-alt{display:flex;gap:18px;justify-content:center;margin-top:14px}
.login-alt button{background:none;border:none;color:var(--faint);font-size:12.5px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0;font-family:inherit}
.login-alt button:hover{color:var(--muted)}

.bilan-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:13px;background:var(--surface);scrollbar-width:none;-ms-overflow-style:none}
.bilan-wrap::-webkit-scrollbar{display:none}
.bilan-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.bilan-table th,.bilan-table td{padding:11px 11px;text-align:right;font-size:13px;border-bottom:1px solid var(--border)}
.bilan-table td{white-space:nowrap}
.bilan-table th{font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:500;background:var(--surface2);white-space:normal;line-height:1.25}
.bilan-table th:first-child,.bilan-table td:first-child{text-align:left}
.bilan-table td{color:var(--text)}
.bilan-mois{font-weight:500}
.bilan-table tbody tr:last-child td{border-bottom:0}
.bilan-ytd td{border-top:2px solid var(--border2);font-weight:600;background:var(--surface2)}
.cell-ok{color:var(--green)}
.cell-ko{color:var(--red)}
.cell-mute{color:var(--faint)}
.bilan-proj{font-size:13.5px;color:var(--muted);line-height:1.6;margin:18px auto 0;max-width:82ch;text-align:center}
.bilan-proj b{color:var(--text);font-weight:600}
.bilan-proj-sub{font-size:12.5px;color:var(--faint)}
.saison-toggle{background:transparent;border:0;color:var(--text);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font:inherit;font-size:13px;padding:0}
.saison-box{max-width:560px;margin:16px auto 0;background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:18px 18px 16px}
.saison-editor{display:flex;gap:5px;align-items:flex-end;justify-content:space-between}
.saison-cell{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0}
.saison-bar-wrap{height:46px;width:100%;display:flex;align-items:flex-end;justify-content:center}
.saison-bar{width:62%;max-width:18px;background:var(--text);border-radius:3px 3px 0 0;min-height:2px;transition:height .15s}
.saison-in{width:100%;max-width:44px;font-family:inherit;font-size:12px;text-align:center;color:var(--text);background:var(--bg);border:1px solid var(--border2);border-radius:7px;padding:5px 2px;font-variant-numeric:tabular-nums}
.saison-in:focus{outline:none;border-color:var(--text)}
.saison-mn{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.02em}
.saison-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:15px;flex-wrap:wrap}
.saison-foot>span{font-size:11.5px;color:var(--faint);line-height:1.4;flex:1;min-width:180px}
.saison-reset{display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--border2);border-radius:8px;color:var(--muted);font:inherit;font-size:12px;padding:6px 11px;cursor:pointer;transition:all .15s;white-space:nowrap}
.saison-reset:hover{color:var(--text);border-color:var(--text)}
@media(max-width:560px){.saison-in{font-size:11px;max-width:36px}.saison-bar-wrap{height:38px}.saison-editor{gap:3px}}

.bilan-cloture{margin-top:32px;text-align:left}
.clot-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:16px;margin-top:4px}
.clot-card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:18px 20px}
.clot-h{font-size:15px;font-weight:600;color:var(--text);margin:0 0 4px}
.clot-sub{font-size:12.5px;color:var(--muted);line-height:1.5;margin:0 0 15px}
.clot-form{display:flex;flex-wrap:wrap;gap:11px;align-items:flex-end}
.clot-f{display:flex;flex-direction:column;gap:5px;font-size:11.5px;color:var(--muted)}
.clot-f input{font-family:inherit;font-size:14px;color:var(--text);background:var(--bg);border:1px solid var(--border2);border-radius:9px;padding:9px 11px;width:118px}
.clot-f input:focus{outline:none;border-color:var(--text)}
.clot-pin{position:relative;display:inline-flex;align-items:center}
.clot-pin i{position:absolute;right:11px;color:var(--faint);font-style:normal;font-size:12px;pointer-events:none}
.clot-form .btn-ghost{padding:9px 15px}
.clot-form .btn-ghost:disabled{opacity:.45;cursor:not-allowed}
.clot-list{list-style:none;margin:15px 0 0;padding:14px 0 0;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:9px}
.clot-list li{display:flex;align-items:center;gap:10px;font-size:13px}
.clot-mois{font-weight:500;color:var(--text);min-width:60px;text-transform:capitalize}
.clot-val{flex:1;color:var(--muted);font-variant-numeric:tabular-nums}
.clot-del{background:transparent;border:0;color:var(--faint);cursor:pointer;padding:4px;border-radius:6px;display:inline-flex;transition:color .15s}
.clot-del:hover{color:var(--red)}
.clot-res{font-size:13.5px;color:var(--muted);margin:15px 0 0}
.clot-res b{font-weight:600}
@media(max-width:760px){.clot-grid{grid-template-columns:1fr}}
.hist-list{display:flex;flex-direction:column;gap:8px}
.hist-row{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:11px 16px}
.hist-date{font-size:13px;color:var(--text);font-weight:500;min-width:130px}
.hist-fig{flex:1;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.hist-load{font-family:inherit;font-size:12.5px;color:var(--text);background:transparent;border:1px solid var(--border2);border-radius:8px;padding:6px 14px;cursor:pointer;transition:border-color .15s}
.hist-load:hover{border-color:var(--text)}
.hist-del{display:inline-flex;align-items:center;justify-content:center;color:var(--faint);background:transparent;border:0;cursor:pointer;padding:6px;transition:color .15s}
.hist-del:hover{color:var(--red)}
@media(max-width:560px){.hist-row{flex-wrap:wrap;gap:8px}.hist-fig{flex-basis:100%;order:3}}
`;
