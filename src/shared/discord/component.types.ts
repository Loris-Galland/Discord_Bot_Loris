import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

export type ComponentInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

// Buttons, select menus and modals all carry a custom id; handlers own every id that
// starts with "<prefix>:" and parse the rest themselves.
export interface ComponentHandler {
  prefix: string;
  handle(interaction: ComponentInteraction): Promise<void>;
}
