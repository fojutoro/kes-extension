import { tagMail } from "./misc.js";

messenger.messages.onNewMailReceived.addListener(listener, true);

async function listener(_, messages) {
    messages.messages.forEach(async (message) => {
        await tagMail(message)
    })
}