export interface MatchPerformance {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

const carryMessages = [
  "🔥 **CARRY ABSOLU.** {kda} sur {champion}, cette game était à sens unique.",
  "🐉 Un {champion} en mission. {kda} et la victoire, rien à ajouter.",
  "💪 {kda} sur {champion} — l'équipe adverse n'avait aucune chance.",
];

const winMessages = [
  "✅ Victoire propre avec {champion}. {kda}, GG.",
  "🏆 Win en poche. {kda} sur {champion}.",
  "👍 Bien joué, victoire avec {champion} ({kda}).",
];

const closeLossMessages = [
  "😤 Défaite malgré {kda} sur {champion}. L'équipe a lâché.",
  "💔 Perdu de justesse. {champion} a fait le taf ({kda}) mais ça n'a pas suffi.",
  "😕 Défaite, mais {kda} sur {champion} n'a rien à se reprocher.",
];

const intMessages = [
  "💀 Aïe. {kda} sur {champion}... on efface et on recommence.",
  "🤡 {champion}, {kda}. Ce n'était pas la game de sa vie.",
  "🧨 Feed alert sur {champion} ({kda}). Faut couper le jeu un peu.",
];

function computeKda(performance: MatchPerformance): number {
  return performance.deaths === 0
    ? performance.kills + performance.assists
    : (performance.kills + performance.assists) / performance.deaths;
}

function pickTemplate(performance: MatchPerformance): string {
  const kda = computeKda(performance);
  const pool = performance.win
    ? kda >= 5
      ? carryMessages
      : winMessages
    : kda < 1.5
      ? intMessages
      : closeLossMessages;

  const template = pool[Math.floor(Math.random() * pool.length)];
  return template ?? "GG.";
}

export function buildScoreMessage(performance: MatchPerformance, championName: string): string {
  const template = pickTemplate(performance);
  const kdaText = `${performance.kills}/${performance.deaths}/${performance.assists}`;
  return template.replace("{champion}", championName).replaceAll("{kda}", kdaText);
}
