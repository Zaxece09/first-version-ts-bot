import { CommandGroup } from "@grammyjs/commands";
import type { CustomContext } from "../types";

import startCommand from "./start";
import sendCommand from "./send";
import stopCommand from "./stop";
import statusCommand from "./status";
import adminCommand from "./admin";
import configCommand from "./config";

export const userCommands = new CommandGroup<CustomContext>().add([
  startCommand,
  sendCommand,
  stopCommand,
  statusCommand,
  adminCommand,
  configCommand,
]);
