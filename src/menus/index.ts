import type { CustomContext } from "../types";
import { Composer } from "grammy";
import { settingsMenu } from "./settings";

const menusConv = new Composer<CustomContext>();
menusConv.use(settingsMenu);

export default menusConv;
