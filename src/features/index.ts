import type { Command } from "../shared/discord/command.types";
import { livechatConfigCommand } from "./livechat/livechatConfig.command";
import { livechatReactionCommand } from "./livechat/livechatReaction.command";
import { musicPlayCommand } from "./music/musicPlay.command";
import { musicQueueCommand } from "./music/musicQueue.command";
import { musicSkipCommand } from "./music/musicSkip.command";
import { musicStopCommand } from "./music/musicStop.command";

export const commands: Command[] = [
  livechatReactionCommand,
  livechatConfigCommand,
  musicPlayCommand,
  musicSkipCommand,
  musicStopCommand,
  musicQueueCommand,
];
