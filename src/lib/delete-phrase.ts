/**
 * What the Super Admin pastes to confirm a deletion: their own username, e.g. "Kishan-Deleting-This".
 * Checked again on the server, so a deletion can't happen by a stray click.
 */
export const deletePhrase = (username: string) => `${username}-Deleting-This`;
