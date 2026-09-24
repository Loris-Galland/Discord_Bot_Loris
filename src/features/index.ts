import type { Command } from "../shared/discord/command.types";
import type { ComponentHandler } from "../shared/discord/component.types";
import { lolBetButtonsHandler } from "./stats/lolBetButtons.component";
import { lolHistorySelectHandler } from "./stats/lolHistory.command";
import { lolMatchButtonsHandler } from "./stats/lolMatchButtons.component";
import { helpCommand } from "./help/help.command";
import { livechatConfigCommand } from "./livechat/livechatConfig.command";
import { livechatReactionCommand } from "./livechat/livechatReaction.command";
import { musicPlayCommand } from "./music/musicPlay.command";
import { musicQueueCommand } from "./music/musicQueue.command";
import { musicSkipCommand } from "./music/musicSkip.command";
import { musicStopCommand } from "./music/musicStop.command";
import { lolBetCommand } from "./stats/lolBet.command";
import { lolBettingConfigCommand } from "./stats/lolBettingConfig.command";
import { lolConfigCommand } from "./stats/lolConfig.command";
import { lolHistoryCommand } from "./stats/lolHistory.command";
import { lolLeaderboardCommand } from "./stats/lolLeaderboard.command";
import { lolLinkCommand } from "./stats/lolLink.command";
import { lolLivePanelCommand } from "./stats/lolLivePanel.command";
import { lolScoreboardCommand } from "./stats/lolScoreboard.command";
import { lolStatsCommand } from "./stats/lolStats.command";
import { lolUnlinkCommand } from "./stats/lolUnlink.command";
import { lolWalletCommand } from "./stats/lolWallet.command";

export const commands: Command[] = [
  helpCommand,
  livechatReactionCommand,
  livechatConfigCommand,
  musicPlayCommand,
  musicSkipCommand,
  musicStopCommand,
  musicQueueCommand,
  lolLinkCommand,
  lolUnlinkCommand,
  lolStatsCommand,
  lolConfigCommand,
  lolLeaderboardCommand,
  lolLivePanelCommand,
  lolHistoryCommand,
  lolScoreboardCommand,
  lolBettingConfigCommand,
  lolBetCommand,
  lolWalletCommand,
];

export const componentHandlers: ComponentHandler[] = [
  lolMatchButtonsHandler,
  lolHistorySelectHandler,
  lolBetButtonsHandler,
];
