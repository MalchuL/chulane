/** Component-specific theming and keyboard guidance for the reference pages. */
export const notes: Record<string, [string, string]> = {
  InlineCitation: [
    "raised,text,radius",
    "Focus or hover the link to preview the source. Enter follows the link.",
  ],
  FileTree: [
    "border,muted,control",
    "Enter or Space toggles the folder row. Select a page directly, or choose Open from a folder’s actions to visit the folder itself.",
  ],
  ScrollArea: [
    "border,muted,control",
    "Tab to the region or its controls. Use the arrow keys to scroll a focused viewport.",
  ],
  ThemeScope: [
    "editor,accent,raised,text",
    "Focus remains within the active overlay and returns to its trigger on dismissal.",
  ],
  Button: [
    "control,accent,on-accent,radius,focus",
    "Activate with Space or Enter. Disabled buttons are skipped in the tab order.",
  ],
  IconButton: [
    "icon,control,hover,focus",
    "Tab exposes the accessible label as a tooltip. Space or Enter runs the action.",
  ],
  Tooltip: [
    "raised,text,shadow,card-radius",
    "Tab to the trigger to show its description. Escape dismisses the tooltip and keeps focus in place.",
  ],
  TooltipProvider: [
    "raised,text",
    "Tab between triggers to show each tooltip immediately. Timing settings apply to pointer hover.",
  ],
  ButtonGroup: ["xs,control", "Tab moves between child controls in document order."],
  SearchField: [
    "control,border,raised,text",
    "Type to update the query. Native text selection and editing shortcuts work.",
  ],
  TextArea: [
    "control,border,raised,text",
    "Enter inserts a line. Native text editing shortcuts remain available.",
  ],
  Checkbox: ["accent,sm", "Focus the checkbox and press Space to toggle it."],
  SelectField: [
    "control,border,raised,text",
    "Use the native select with the arrow keys and typeahead.",
  ],
  SegmentedControl: [
    "control,selection,selected",
    "Tab to an option and activate with Space or Enter.",
  ],
  Badge: ["small,selection,selected,round", "A badge is static text and does not receive focus."],
  Chip: [
    "round,selection,selected,small",
    "Focus the chip and activate it to remove the attachment.",
  ],
  Separator: ["line,border", "The separator is static and stays outside the tab order."],
  Popover: [
    "raised,shadow,layer,card-radius",
    "Enter opens the popover. Escape closes it and restores trigger focus.",
  ],
  Dialog: [
    "dialog-width,overlay,layer,shadow",
    "Tab cycles within the open dialog. Escape dismisses it and restores focus.",
  ],
  ConfirmAction: [
    "dialog-width,overlay,danger",
    "Focus starts on Cancel. Tab to confirm or press Escape to cancel.",
  ],
  Feedback: [
    "focus-line,border,lg",
    "Status updates are announced. Errors may offer a keyboard-accessible Retry button.",
  ],
  ActionMenu: [
    "menu-row,menu-label,menu-icon,menu-width,hover,shadow,radius",
    "Enter opens the menu. Use arrow keys for items and submenus, typeahead to find an item and Escape to return.",
  ],
  ContextMenu: [
    "menu-width,hover,shadow",
    "Focus the target and press Shift + F10 or the context menu key. Arrow keys navigate actions.",
  ],
  CommandPalette: [
    "dialog-width,control,focus",
    "Type to filter, use Up or Down to choose and Enter to run. Escape restores focus.",
  ],
  CommandToolbar: [
    "icon,control,sm,focus",
    "Tab through enabled commands. Press Enter or Space to run the focused command.",
  ],
  WorkspaceSwitcher: [
    "sidebar,control,menu-width",
    "Open with Enter and use arrows to choose the active workspace. A drive marks local storage and a cloud marks cloud storage when the host supplies its location.",
  ],
  NavigationTree: [
    "selection,selected,lg,hover",
    "Use Tab to reach each disclosure, destination and contextual action.",
  ],
  Sidebar: [
    "sidebar,rail,nav,expanded,selection",
    "Tab to section headings to collapse them. The customization menu provides Move up and Move down actions.",
  ],
  WorkspaceShell: [
    "window,nav,agent,grip,compact-breakpoint",
    "Focus a resize separator and use Left or Right. The narrow agent dialog supports Escape.",
  ],
  WorkspaceOverview: ["editor,raised,card-radius", "Follow a document link with Tab and Enter."],
  Breadcrumbs: ["accent,sm", "Tab through links. The final link identifies the current page."],
  DocumentTabs: [
    "toolbar,selection,control",
    "Tab through tabs and close controls. Alt + Left or Right moves the focused document.",
  ],
  DocumentProperties: [
    "muted,body,md",
    "Read property labels and values in sequence. Interactive values retain their native keyboard behavior.",
  ],
  DocumentImage: [
    "small,muted,reading-width",
    "The image exposes its alternative text. Tab reaches an attribution link when supplied.",
  ],
  DocumentSurface: [
    "reading-width,reading,reading-leading,title",
    "Tab reaches the interactive content supplied by the host in document order.",
  ],
  BlockControls: [
    "icon,control,focus",
    "Tab reveals the block actions. Activate Insert or open the block menu for additional actions.",
  ],
  SelectionToolbar: [
    "raised,shadow,control",
    "Select a passage. In the editor example Alt + F10 focuses the floating strip. Mouse activation preserves the current editor selection.",
  ],
  SlashMenu: [
    "menu-width,raised,focus",
    "Type a query, use arrows to navigate and Enter to insert. Escape returns to the host editor.",
  ],
  PageRow: [
    "row,selection,muted,border",
    "Activate the page title to open it or tab to its separate actions menu.",
  ],
  PageBrowser: [
    "row,editor,selection,menu-width",
    "Type in Search pages. Tab to filter, sort, view and page actions.",
  ],
  AgentMessage: [
    "body,chat-leading,muted,accent",
    "Citation links and the optional activity disclosure follow the message in tab order.",
  ],
  ActivityTrace: [
    "muted,sm,lg",
    "Focus the summary and press Enter or Space to expand the activity.",
  ],
  ChangeDiff: [
    "add,delete,success,danger,mono",
    "Enter or Space toggles the original and proposed passages.",
  ],
  AgentComposer: [
    "raised,control,border,card-radius",
    "Use the mode and model buttons to open their menus. Enter sends or queues a nonempty draft. Shift + Enter inserts a line. Stop is available while streaming.",
  ],
  MessageQueue: [
    "raised,control,focus",
    "Tab to Edit, change the queued text, then Save or Cancel without replacing the composer draft.",
  ],
  ChangeReview: [
    "raised,add,delete,danger",
    "Open the diff with Enter. Tab to Apply, Dismiss or Undo as allowed by the operation state.",
  ],
  AgentPanel: [
    "sidebar,raised,sm,control",
    "Conversation controls, the scrollable transcript and the anchored composer follow document order.",
  ],
};
