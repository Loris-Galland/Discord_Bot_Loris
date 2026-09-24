import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ComponentHandler } from "../../shared/discord/component.types";
import { lolBetRepository } from "./lolBetRepository";
import { BET_BUTTON_PREFIX, placeWager, refreshBetMessage } from "./lolBetting.service";
import { BLUE_TEAM_ID } from "./lolMatchViews";
import { lolWalletRepository } from "./lolWalletRepository";

const AMOUNT_INPUT_ID = "amount";

// Two steps: the team button opens a small form asking for the amount
// ("lolbet:pick:<gameId>:<teamId>"), submitting it places the wager
// ("lolbet:amount:<gameId>:<teamId>").
export const lolBetButtonsHandler: ComponentHandler = {
  prefix: BET_BUTTON_PREFIX,

  async handle(interaction) {
    const [, step, gameIdRaw, teamIdRaw] = interaction.customId.split(":");
    const gameId = Number(gameIdRaw);
    const teamId = Number(teamIdRaw);
    if (!interaction.guildId || !Number.isFinite(gameId) || !Number.isFinite(teamId)) {
      return;
    }

    const bet = lolBetRepository.get(interaction.guildId, gameId);
    if (!bet || bet.closed || Date.now() >= bet.closesAt) {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: "Les paris sont fermés pour cette partie.", ephemeral: true });
      }
      return;
    }

    if (step === "pick" && interaction.isButton()) {
      const balance = lolWalletRepository.getBalance(interaction.user.id);
      const side = teamId === BLUE_TEAM_ID ? "bleue" : "rouge";
      const modal = new ModalBuilder()
        .setCustomId(`${BET_BUTTON_PREFIX}:amount:${gameId}:${teamId}`)
        .setTitle(`Parier sur l'équipe ${side}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(AMOUNT_INPUT_ID)
              .setLabel(`Mise (solde : ${balance} jetons)`)
              .setPlaceholder("100")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(9),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (step === "amount" && interaction.isModalSubmit()) {
      const raw = interaction.fields.getTextInputValue(AMOUNT_INPUT_ID).trim();
      const amount = /^\d+$/.test(raw) ? Number(raw) : NaN;
      const result = placeWager(bet, interaction.user.id, teamId, amount);
      await interaction.reply({ content: result.message, ephemeral: true });

      const updated = lolBetRepository.get(interaction.guildId, gameId);
      if (result.ok && updated) {
        await refreshBetMessage(interaction.client, updated, "open");
      }
    }
  },
};
