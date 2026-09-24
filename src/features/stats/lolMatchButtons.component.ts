import type { ComponentHandler } from "../../shared/discord/component.types";
import { createLogger } from "../../shared/logger/logger";
import { getCachedMatch, getCachedTimeline } from "./lolMatchCache";
import {
  buildDamageView,
  buildDetailsView,
  buildEventsView,
  buildGoldView,
  buildItemsView,
  buildMatchButtons,
  buildScoreboardView,
  MATCH_BUTTON_PREFIX,
  type MatchView,
  type MatchViewMessage,
} from "./lolMatchViews";
import { RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-match-buttons");

// Buttons shown under a scoreboard (the scoreboard itself is already on screen).
export const SCOREBOARD_FOLLOW_UP_VIEWS: MatchView[] = ["details", "gold", "damage", "items", "events"];

export async function renderMatchView(
  view: MatchView,
  matchId: string,
  trackedIndex: number,
): Promise<MatchViewMessage> {
  const match = await getCachedMatch(matchId);
  switch (view) {
    case "scoreboard": {
      const message = await buildScoreboardView(match, trackedIndex);
      return {
        ...message,
        components: [buildMatchButtons(matchId, trackedIndex, SCOREBOARD_FOLLOW_UP_VIEWS)],
      };
    }
    case "details":
      return buildDetailsView(match, trackedIndex);
    case "items":
      return buildItemsView(match, trackedIndex);
    case "damage":
      return buildDamageView(match, trackedIndex);
    case "gold":
      return buildGoldView(match, await getCachedTimeline(matchId), trackedIndex);
    case "events":
      return buildEventsView(match, await getCachedTimeline(matchId), trackedIndex);
  }
}

// Replies privately to whoever clicked, so several friends can browse the same game's
// graphs without flooding the channel.
export const lolMatchButtonsHandler: ComponentHandler = {
  prefix: MATCH_BUTTON_PREFIX,

  async handle(interaction) {
    if (!interaction.isButton()) {
      return;
    }

    const [, view, matchId, trackedIndexRaw] = interaction.customId.split(":");
    if (!view || !matchId) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const message = await renderMatchView(view as MatchView, matchId, Number(trackedIndexRaw ?? -1));
      await interaction.editReply(message);
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error(`Failed to render ${view} for ${matchId}.`, error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};
