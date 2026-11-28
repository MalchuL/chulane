/** Public data and callback contracts for slash-menu. */

import type { Command } from "../../commands/types.js";
export type SlashMenuProps = { commands: Command[]; onClose: () => void };
