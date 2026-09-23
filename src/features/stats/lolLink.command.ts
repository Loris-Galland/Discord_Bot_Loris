import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { findRegion, LOL_REGIONS } from "./lol.types";
import { lolLinkRepository } from "./lolLinkRepository";
import { getAccountByRiotId, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-link-command");

export const lolLinkCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-link")
    .setDescription("Link your Riot account for LoL stats tracking.")
    .addStringOption((option) =>
      option.setName("riot-id").setDescription("Your Riot ID, e.g. Faker#KR1").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("region")
        .setDescription("Your account's region.")
        .setRequired(true)
        .addChoices(
          ...LOL_REGIONS.map((region) => ({ name: region.label, value: region.platform })),
        ),
    ),

  async execute(interaction) {
    const riotId = interaction.options.getString("riot-id", true);
    const platform = interaction.options.getString("region", true);
    const region = findRegion(platform);
    if (!region) {
      await interaction.reply({ content: "Unknown region.", ephemeral: true });
      return;
    }

    const [gameName, tagLine] = riotId.split("#");
    if (!gameName || !tagLine) {
      await interaction.reply({
        content: "Invalid Riot ID format. Use `Name#Tag` (e.g. `Faker#KR1`).",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const account = await getAccountByRiotId(region.regional, gameName, tagLine);
      lolLinkRepository.set(interaction.user.id, {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platform: region.platform,
        regional: region.regional,
      });
      await interaction.editReply(
        `Linked to **${account.gameName}#${account.tagLine}** (${region.label}).`,
      );
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error("Failed to link Riot account.", error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};
