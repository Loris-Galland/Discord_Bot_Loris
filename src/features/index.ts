import type { Command } from "../shared/discord/command.types";
import { helpCommand } from "./help/help.command";
import { livechatConfigCommand } from "./livechat/livechatConfig.command";
import { livechatReactionCommand } from "./livechat/livechatReaction.command";
import { musicPlayCommand } from "./music/musicPlay.command";
import { musicQueueCommand } from "./music/musicQueue.command";
import { musicSkipCommand } from "./music/musicSkip.command";
import { musicStopCommand } from "./music/musicStop.command";
import { lolConfigCommand } from "./stats/lolConfig.command";
import { lolLeaderboardCommand } from "./stats/lolLeaderboard.command";
import { lolLinkCommand } from "./stats/lolLink.command";
import { lolStatsCommand } from "./stats/lolStats.command";
import { lolUnlinkCommand } from "./stats/lolUnlink.command";

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
];
