import {ChatContext} from "../types";
import {ChatMessage} from "../chatgpt";
import {knex} from "./AppService";
import {gptConversation, gptUser} from "../models/tableModel";
import UsersModel from "../models/usersModel";
import {ConversationModel} from "../models/ConversationModel";
import {generateRandomIntString} from "../utils";
import process from "process";
import * as console from "console";
import {JwtUser} from "../interfaces/auth";

export const ChatProcessPipe = async (prompt: string, chat: ChatMessage, user: JwtUser) => {
    if (!isFinish(chat)) {
        return
    }
    const parentMessageId = chat.parentMessageId
    let app_conversation_id = getAppConversationId(parentMessageId)
    if (!app_conversation_id) {
        app_conversation_id = generateRandomIntString(20).toString()
    }
    try {
        await createConversation(prompt, app_conversation_id, chat, user);
        await updateToken(app_conversation_id, user)
    } catch (e) {
        console.log("createConversation error", e);
    }
}

const isFinish = (chat: ChatMessage) => {
    try {
        const finish_reason = chat.detail['choices'][0]['finish_reason'];
        return finish_reason === 'stop'
    } catch (e) {
        return true;
    }
}

const getAppConversationId = (parentMessageId: string): string | null => {
    const conversation = knex(gptConversation)
        .where('chat_id', parentMessageId)
        .select('app_conversation_id')
        .first() as ConversationModel

    if (!conversation) {
        return null
    }

    return conversation.app_conversation_id
}

const createConversation = async (message: string, app_conversation_id: string, chat: ChatMessage, user) => {
    const conversation = {
        app_conversation_id: app_conversation_id,
        conversation_id: chat.conversationId,
        api_key_id: process.env.OPENAI_API_KEY,
        parent_message_id: chat.parentMessageId,
        message: message,
        ip: '',
        user_id: user.userId,
        chat_id: chat.id,
        reply: chat.text,
        all_json: JSON.stringify(chat),
    } as ConversationModel

    await knex(gptConversation).insert(conversation)
}

const updateToken = async (app_conversation_id: string, user: JwtUser) => {
    const query = knex(gptConversation)
        .select(['reply', 'message'])
        .where('app_conversation_id', app_conversation_id)
    const conversations = await query as ConversationModel[]
    let len:number = 0
    conversations.forEach((conversation) => {
        const {reply, message} = conversation
        len += reply.length
        len += message.length
    })
    const user_id = user.userId
    const _user = (await knex(gptUser).where('user_id', user_id).first()) as JwtUser
    let surplus = _user.balance - len
    if(surplus <= 0) {
        surplus = 0
    }
    await knex(gptUser).where('user_id', user_id).update({balance: surplus})
}