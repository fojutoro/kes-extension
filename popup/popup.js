import { downloadAllSelectedEmailAttachments, tagSelectedEmails, handleError } from "../js/misc.js";

const func1 = document.getElementById("func1");
const func2 = document.getElementById("func2");

func1.addEventListener("click", async () => {
    try {
        await downloadAllSelectedEmailAttachments();
    } catch (error) {
        handleError("func1.EventListener -> downloadAllSelectedEmailAttachments", error);
    }
});

func2.addEventListener("click", async () => {
    try {
        await tagSelectedEmails();
    } catch (error) {
        handleError("func2.EventListener -> tagSelectedEmails", error);
    }
});