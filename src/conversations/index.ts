import type { CustomContext } from "../types";
import { Composer } from "grammy";
import nickCheckConv from "./nickCheck";
import priorityEditConv from "./priorityEdit";
import spoofNameEditConv from "./spoofNameEdit";
import intervalEditConv from "./intervalEdit";
import apiKeyEditConv from "./apiKeyEdit";
import topicAddConv from "./topicAdd";
import topicEditConv from "./topicEdit";
import presetAddConv from "./presetAdd";
import presetEditConv from "./presetEdit";
import proxyAddConv from "./proxyAdd";
import proxyEditConv from "./proxyEdit";
import smartPresetAddConv from "./smartPresetAdd";
import smartPresetEditConv from "./smartPresetEdit";
import emailAddConv from "./emailAdd";
import emailEditConv from "./emailEdit";
import profileIdEditConv from "./profileIdEdit";
import htmlTemplateGetConv from "./htmlTemplateGet";

import sendEmailConv from "./sendEmail";

const composerConv = new Composer<CustomContext>();

// Логирование для отладки
composerConv.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    console.log(`🔍 [conversations/index] Callback before conversations: ${ctx.callbackQuery.data?.substring(0, 50)}`);
  }
  await next();
  if (ctx.callbackQuery) {
    console.log(`✅ [conversations/index] Callback after conversations`);
  }
});

composerConv.use(nickCheckConv);
composerConv.use(priorityEditConv);
composerConv.use(spoofNameEditConv);
composerConv.use(intervalEditConv);
composerConv.use(apiKeyEditConv);
composerConv.use(topicAddConv);
composerConv.use(topicEditConv);
composerConv.use(presetAddConv);
composerConv.use(presetEditConv);
composerConv.use(proxyAddConv);
composerConv.use(proxyEditConv);
composerConv.use(smartPresetAddConv);
composerConv.use(smartPresetEditConv);
composerConv.use(emailAddConv);
composerConv.use(emailEditConv);
composerConv.use(sendEmailConv);
composerConv.use(profileIdEditConv);
composerConv.use(htmlTemplateGetConv);

export default composerConv;
