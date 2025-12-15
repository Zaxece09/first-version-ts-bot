import type { Api, Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";
import type { CommandsFlavor } from "@grammyjs/commands";
import type { HydrateFlavor, HydrateApiFlavor } from "@grammyjs/hydrate";
import type {
  FileApiFlavor,
  FileFlavor,
} from "@grammyjs/files";
import type { Message } from "@grammyjs/types";

// Тип для replyOrEdit
export type ReplyOrEdit = (
  ...args: Parameters<Context["reply"]>
) => Promise<Message.TextMessage | true | undefined>;

// Сессия
export interface SessionData {
  step: string;
}

// Кастомный контекст
export type CustomContext = HydrateFlavor<
  FileFlavor<
    Context &
      SessionFlavor<SessionData> &
      CommandsFlavor<Context> &
      ConversationFlavor<Context> & {
        replyOrEdit: ReplyOrEdit;
      }
  >
>;

// Кастомный API
export type CustomApi = HydrateApiFlavor<Api & FileApiFlavor<Api>>;
