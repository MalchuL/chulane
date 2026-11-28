/** Public component, theme and interaction contracts. */
// Agent
export {
  ActivityTrace,
  AgentComposer,
  AgentMessage,
  AgentPanel,
  ChangeDiff,
  ChangeReview,
  InlineCitation,
  MessageQueue,
} from "./agent/index.js";
export type {
  ActivityEntry,
  ActivityEvent,
  ActivityKind,
  ActivityStatus,
  ActivityTraceProps,
  AgentComposerProps,
  AgentDraft,
  AgentMessageProps,
  AgentMessageSide,
  AgentMessageStatus,
  AgentPanelProps,
  ChangeDiffProps,
  ChangeReviewProps,
  ChangeStatus,
  ChangeTarget,
  CitationSource,
  ContextItem,
  ContextItemKind,
  InlineCitationProps,
  MessageQueueProps,
  ModelOption,
  ProposedChange,
  QueuedMessage,
} from "./agent/index.js";
// Commands
export { ActionMenu, CommandPalette, CommandToolbar, ContextMenu } from "./commands/index.js";
export type {
  ActionMenuProps,
  Command,
  CommandPaletteProps,
  CommandToolbarProps,
  ContextMenuProps,
  MenuEntry,
} from "./commands/index.js";
// Document
export {
  BlockControls,
  Breadcrumbs,
  DocumentImage,
  DocumentProperties,
  DocumentSurface,
  DocumentTabs,
  PageBrowser,
  PageRow,
  SelectionToolbar,
  SlashMenu,
} from "./document/index.js";
export type {
  BlockControlsProps,
  BreadcrumbsProps,
  DocumentImageProps,
  DocumentPropertiesProps,
  DocumentSurfaceProps,
  DocumentTab,
  DocumentTabsProps,
  PageBrowserProps,
  PageReference,
  PageRowProps,
  PageSummary,
  SelectionToolbarProps,
  SlashMenuOption,
  SlashMenuProps,
} from "./document/index.js";
/* Navigation */
export {
  createDefaultSidebarPreferences,
  FileTree,
  NavigationTree,
  Sidebar,
  WorkspaceSwitcher,
} from "./navigation/index.js";
export type {
  FileTreeProps,
  NavigationItem,
  NavigationItemKind,
  NavigationTreeProps,
  SidebarDestination,
  SidebarMode,
  SidebarPreferences,
  SidebarProps,
  SidebarSection,
  WorkspaceOption,
  WorkspaceSwitcherProps,
} from "./navigation/index.js";
// Workspace
export { WorkspaceOverview, WorkspaceShell } from "./workspace/index.js";
export type {
  WorkspaceOverviewProps,
  WorkspaceOverviewSection,
  WorkspacePanels,
  WorkspaceShellProps,
} from "./workspace/index.js";


/** Foundation controls and theme. */
export {
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  ConfirmAction,
  Dialog,
  Feedback,
  IconButton,
  Popover,
  ScrollArea,
  SearchField,
  SegmentedControl,
  SelectField,
  Separator,
  TextArea,
  ThemeScope,
  Tooltip,
  TooltipProvider,
  useTheme,
} from "./foundation/index.js";
export type {
  BadgeProps,
  ButtonGroupProps,
  ButtonLayout,
  ButtonProps,
  CheckboxCheckedState,
  CheckboxProps,
  ChipProps,
  ConfirmActionProps,
  DialogProps,
  FeedbackProps,
  FeedbackStatus,
  IconButtonProps,
  PopoverProps,
  ResolvedTheme,
  ScrollAreaProps,
  SearchFieldProps,
  SegmentedControlProps,
  SelectFieldProps,
  SeparatorProps,
  TextAreaProps,
  ThemePreference,
  ThemeScopeProps,
  ThemeTokens,
  TooltipProps,
  TooltipProviderProps,
  UseThemeResult,
} from "./foundation/index.js";
