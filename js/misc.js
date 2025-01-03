export async function loadFiletypes() {
  const response = await fetch(browser.runtime.getURL("data/filetypes.json"));
  const filetypes = await response.json();
  return filetypes;
}

const getSelectedEmails = async () => {
  try {
    const tabs = await messenger.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs.length) {
      alert("Prosim otvor svoju email schranku.");
      return null;
    }
    return messenger.mailTabs.getSelectedMessages(tabs[0].id);
  } catch (error) {
    handleError("getSelectedEmails", error);
  }
};

const getAttachments = async (email) => {
  return browser.messages.listAttachments(email.id);
};

const createTag = async (tagName, tagColor, tagKey, existingTags) => {
  try {
    if (existingTags.some((tag) => tag.tag === tagName)) {
      console.log(`Tag "${tagName}" already exists.`);
      return existingTags;
    }

    await browser.messages.tags.create(tagKey, tagName, tagColor);
    existingTags.push({ key: tagKey, tag: tagName, color: tagColor });
    console.log(`Tag "${tagName}" created successfully.`);
    return existingTags;
  } catch (error) {
    handleError("createTag", error);
  }
};

const addTagsToMail = async (mail, tagsToAdd, existingTags) => {
  try {
    // Collect all keys for the tags to add
    const tagKeysToAdd = tagsToAdd
      .map((tag) => {
        const existingTag = existingTags.find((t) => t.tag === tag.name);
        if (existingTag) {
          return existingTag.key;
        }
        return null;
      })
      .filter(Boolean); // Remove nulls for non-existing tags

    if (!tagKeysToAdd.length) return; // No tags to add

    // Combine current mail tags with new tags, ensuring no duplicates
    const originalTags = mail.tags || [];
    const updatedTags = [...new Set([...originalTags, ...tagKeysToAdd])];

    // Update the mail with all tags at once
    await browser.messages.update(mail.id, {
      tags: updatedTags,
    });
    console.log(`Tags added to mail ID: ${mail.id} ->`, updatedTags);
  } catch (error) {
    handleError("addTagsToMail", error);
  }
};

export const tagMail = async (mail) => {
  const filetypes = await loadFiletypes();
  const attachments = await getAttachments(mail);
  const extensions = [
    ...new Set(attachments.map((att) => att.name.split(".").pop())),
  ];

  let existingTags = await browser.messages.tags.list();
  const tagsToAdd = [];

  for (const extension of extensions) {
    const filetype = Object.entries(filetypes).find(([_, type]) =>
      type.names.includes(extension)
    );

    if (filetype) {
      const [tag, { color, key }] = filetype;

      // Check if the tag already exists
      if (!existingTags.some((t) => t.tag === tag)) {
        existingTags = await createTag(tag, color, key, existingTags);
      }

      tagsToAdd.push({ name: tag, color });
    } else {
      // Handle unknown file types
      const unknownTag = "Ostatne";
      const unknownColor = "#000000";

      const existingOstatneTag = existingTags.find((t) => t.tag === unknownTag);

      if (!existingOstatneTag) {
        let ostatneKey = "a928a8c6-ef06-4953-8ecd-52938f0de53a";
        await browser.messages.tags.create(
          ostatneKey,
          unknownTag,
          unknownColor
        );
        existingTags.push({
          key: ostatneKey,
          tag: unknownTag,
          color: unknownColor,
        });
      }

      tagsToAdd.push({ name: unknownTag, color: unknownColor });
    }
  }

  await addTagsToMail(mail, tagsToAdd, existingTags);
};

export const tagSelectedEmails = async () => {
  const emails = await getSelectedEmails();
  if (!emails) return;

  for (const email of emails.messages) {
    await tagMail(email);
  }
};

const ensureDirectoryExists = async (directoryPath) => {
  try {
    const dirHandle = await browser.storage.local.get(directoryPath);
    if (!dirHandle) {
      console.log(`Directory does not exist: ${directoryPath}`);
      return null;
    }
    return dirHandle;
  } catch (error) {
    console.error(
      `Failed to check or create directory ${directoryPath}:`,
      error
    );
    return null;
  }
};

const downloadAttachment = async (message, attachment) => {
  try {
    // Decode and sanitize the filename
    const sanitizedFilename = decodeURIComponent(attachment.name).replace(/[\\/:\*\?\"<>|]/g, "_");

    // Use the browser.messages.getAttachmentFile API to fetch the attachment as a Blob
    const blob = await browser.messages.getAttachmentFile(message.id, attachment.partName);

    // Create a temporary URL for the Blob
    const blobUrl = URL.createObjectURL(blob);

    // Use the browser.downloads API to save the attachment
    let downloadId;
    try {
      console.log(blobUrl)
      downloadId = await browser.downloads.download({
        url: blobUrl,
        filename: sanitizedFilename,
        conflictAction: "overwrite",
      });
      console.log("comepleted")
    } catch (downloadError) {
      console.error("Error during download:", downloadError);
      throw downloadError; // Re-throw the error if needed
    }

    console.log(`Downloaded: ${sanitizedFilename}`);
    return downloadId;
  } catch (error) {
    console.error(`Failed to download attachment ${attachment.name}:`, error);
  }
};



const getFileExtension = (filename) => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
};

export const downloadAllSelectedEmailAttachments = async () => {
  try {
    const emails = await getSelectedEmails(); // Fetch selected emails
    const fileTypes = loadFiletypes()
    if (!emails) return;

    for (const message of emails.messages) {
      const attachments = await getAttachments(message); // Fetch attachments for each message

      for (const attachment of attachments) {
        const extension = getFileExtension(attachment.name); // Get file extension
        const category = Object.keys(fileTypes).find((key) =>
          fileTypes[key].names.includes(extension)
        );
        // const directoryPath = category
        //   ? `C:\\downloads\\${category}`
        //   : `C:\\downloads\\Other`;
        const directoryPath = category
          ? `/Users/fojutoro/Documents/projects/thunderbird_extensions/kes-extension/${category}`
          : `/Users/fojutoro/Documents/projects/thunderbird_extensions/kes-extension`;

        // Ensure directory exists
        const dirExists = await ensureDirectoryExists(directoryPath);
        if (!dirExists) {
          console.warn(
            `Skipping download for ${attachment.name}: Directory missing`
          );
          continue;
        }

        // Download attachment
        await downloadAttachment(message, attachment, directoryPath);
      }
    }
  } catch (error) {
    console.error("Error during attachment download:", error);
  }
};

export const handleError = (fnName, error) => {
  alert(`Error occurred in ${fnName}:\n${error.message}`);
  console.error(`${fnName}:`, error);
};

