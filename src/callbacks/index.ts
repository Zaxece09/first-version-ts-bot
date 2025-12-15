import { Composer } from "grammy";
import type { CustomContext } from "../types";

import getMail from "./getMail";

const composer = new Composer<CustomContext>();

// Подключаем все компоненты
composer.use(getMail);


export default composer;
