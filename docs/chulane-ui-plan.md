# Chulane UI delivery plan

## Sources and decisions

Use the latest adaptive sidebar requirements in temp/ui_design/conversation.md, then the purple theme and geometry in temp/ui_design/DESIGN.md. Earlier examples and source/messages.json define interactions. The approved PNG was unavailable. Only read-only subagents inspect the PoC at /home/vlad/orca/workspaces/chulane/temp_app/app/chulane-poc/src/renderer. Implement in the current workspace.

## Library

- Foundation: semantic light/dark/system tokens for colors, typography, sizing, spacing, radii, elevation, motion and focus. Scoped overrides. Accessible buttons, tooltips, inputs, chips, selection, overlays, confirmation and feedback.
- Workspace: independently collapsible and resizable navigation and agent regions, compact navigation and modal agent on narrow screens, split editor and focus mode.
- Navigation: workspace selector, fixed footer, Favorites, Projects, Recent Pages and AI Conversations. Compact, standard and expanded modes, tree, optional collections, section visibility, collapse, reorder by pointer or keyboard, restore defaults, persistent preferences.
- Library: searchable, sortable, filterable page browser, list/grid, contextual actions and create; All Pages, Journal, Tags, Trash, Project and overview examples.
- Document: tabs, breadcrumbs, toolbar, status, metadata, tags, backlinks, attributed images, selection/block/slash actions. Host owns editing and commands.
- Agent: selectable conversations, rich messages, citations, trace, context chips, multiline draft, modes/models, streaming and cancellation, independent queued edits, grouped review with diff, apply/dismiss/undo and failure recovery.
- Commands: shared typed definitions for toolbars, palette and Create/Page/View/Appearance/Block/Agent menus; shortcuts, keyboard navigation, focus restoration and reversible destructive actions.
- Organize by family and component. Keep hooks in `hooks.ts`, types in `types.ts`, and only re-exports in `index.ts`. Expose ESM and declarations through `@chulane/ui` and the compiled stylesheet through `@chulane/ui/styles.css`.

## Demo and verification

Build English Vite catalog in apps/ui-catalog. Run pnpm --filter ui-catalog dev, open http://localhost:5273/components or /examples. Each public component has a route, working example, copyable source, API, tokens, keyboard behavior and usage. Compose workspace, editor and agent review examples with local fixtures and callbacks.

Check strict types, ESLint/accessibility, Stylelint, formatting, index exports, token usage, component scenarios, production builds and consumer imports. Exercise catalog routes, themes, keyboard/focus, sidebar preferences, layouts at 1024/1280/1440/1920/2560, diff and queue states in Playwright with axe. Verify scoped overrides and screenshots.

## Historical verification before the shadcn migration

The library exports 42 components. The catalog covers each public component and includes the three composed examples above. Workspace ESLint, Stylelint, strict TypeScript checks, both production builds, formatting and frozen-lockfile installation passed. Three Node tests cover entry points, catalog coverage, sidebar defaults and re-export rules. All 25 Chromium scenarios passed, including axe checks on five routes in both themes, scoped overlays, five desktop widths, keyboard navigation, file import, conversation drafts and queue delivery. Firefox and WebKit were not exercised. The original reference PNG could not be compared directly.

## Follow-up for design sections 4–7

Use the original widget markup in source/messages.json, message 7. Match the four named menus, contextual selection strip and block gutter, single-surface composer with mode and model popovers, and compact change rows with optional diffs. Update the public components, component previews and composed examples together. Check keyboard actions, selected text, pending/applied transitions and responsive geometry in Chromium.

Delivered sections 4–7 in the [submenu](http://localhost:5273/components/action-menu), [editor](http://localhost:5273/examples/document-editor), [composer](http://localhost:5273/components/agent-composer) and [change review](http://localhost:5273/components/change-review) examples. Verified all 29 Chromium scenarios, including new checks for menu geometry, live appearance changes, selection positioning without layout shift, paragraph reordering, mode/model switching, file context, diff disclosure and per-row undo. Both packages build. Workspace lint, type checks, formatting and all three library tests pass.

The shadcn CLI uses `packages/chulane_ui/components.json` and `src/globals.css`. The radix-nova registry sources for Button, Input and Textarea live in `src/components/ui/`; Chulane's search and multiline fields use these primitives. The catalog imports `@chulane/ui/styles.css`.

## Миграция на shadcn/ui и AI Elements

Пакет поставляет компоненты, приложение владеет данными и действиями. Сборка рабочего пространства и Resizable относятся к демо. Визуальная основа — стандартные варианты radix-nova с CSS-токенами из globals.css и поддержкой вложенных тем. Макеты ui_design служат ориентиром для сценариев.

| Область | Основа | Правило реализации и проверки |
|---|---|---|
| Checkbox и поля | Checkbox, Field, NativeSelect, ToggleGroup, Input, Textarea | Заменить нативный Checkbox. Перевести вызовы на checked/onCheckedChange; проверить mixed, disabled, подпись и Space. |
| Кнопки и состояния | ButtonGroup, Button, Tooltip, Badge, Separator, Empty, Alert, Spinner | Для наборов действий добавить buttonLayout: grouped / separate. По умолчанию компактные логические группы. Одиночное действие остаётся Button. |
| Открываемые окна | Dialog, AlertDialog, CommandDialog | Формы, настройки, инспекторы и агент поверх узкого экрана используют Dialog. Для опасных действий — AlertDialog. У меню выбора и встроенных раскрытий остаётся соответствующая семантика. Проверить Escape, возврат фокуса и ThemeScope. |
| Прокрутка | ScrollArea, ScrollBar, MessageScroller | Все управляемые области прокрутки в библиотеке и каталоге переводим на ScrollArea, включая горизонтальные. В потоке сообщений один viewport, которым владеет MessageScroller; при совместимом API разделяем viewport со ScrollArea. Сохранить нативную прокрутку текста при вводе. |
| Дерево и навигация | AI Elements File Tree, Sidebar, Collapsible, ContextMenu | Проекты, страницы, коллекции и вложенные элементы поставляет приложение со стабильными ID отдельно от отображаемых путей. Выбор, раскрытие, действия строки и клавиатура. Собственный Sidebar собирается из готовых частей. |
| Демонстрационное рабочее пространство | Resizable, Sidebar, Dialog | Resizable управляет шириной панелей в apps/ui-catalog. Проверить клавиатуру, сворачивание и узкий экран. Компоненты можно встроить в другое приложение без этого layout. |
| Команды и редактор | DropdownMenu, ContextMenu, Command, Kbd, Breadcrumb, ButtonGroup, Item, Card | Каталог команд общий для меню, палитры и slash-меню. Позицию панели выделения, действия блока и перенос вкладок контролирует хост. |
| Ввод и контекст агента | AI Elements Prompt Input, Model Selector; Attachment | Режим, модель, контекст и вложения внутри композера. Enter отправляет, Shift+Enter переносит строку; при генерации доступны очередь и остановка. |
| Отправка и история | AI Elements Message, MessageScroller | На отправке сразу показать сообщение пользователя с ID от хоста. Для ответа один ID на весь стрим. Следовать за новыми сообщениями у конца ленты, при чтении истории сохранять позицию и показать переход к последнему сообщению. Проверить переключение разговоров. |
| Ссылки и работа агента | AI Elements Inline Citation, Sources, Reasoning, Tool | Читаемые ссылки, источники и предоставленные хостом события. Для шагов выполнения с существующими данными — Task/Plan. |
| Очередь и правки | AI Elements Queue, Confirmation; Collapsible, ButtonGroup | Раздельные черновики, редактирование и удаление из очереди. У изменений компактные строки, diff по запросу, apply/dismiss/retry/undo и счётчик подтверждений. |

Порядок: поля и кнопки → окна и прокрутка → дерево, меню и редактор → чат → композиция демо. После каждой группы — типы, линтеры, сборка и браузерные проверки. В каталоге показать оба режима кнопок, раскрытое дерево, modal focus, длинную историю со стримингом и раскрытый diff в обеих темах.

### Первый этап миграции

В [каталоге](http://localhost:5273/components) 45 страниц компонентов. [FileTree](http://localhost:5273/components/file-tree) использует ID приложения для выбора и раскрытия. [ButtonGroup](http://localhost:5273/components/button-group) поддерживает локальный выбор компоновки и настройку через ThemeScope. Формы и подтверждения используют Dialog и AlertDialog, списки команд и подменю поддерживают клавиатуру. Демонстрационный [workspace](http://localhost:5273/examples/knowledge-workspace) сохраняет ширину Resizable-панелей в пикселях.

[Демо агента](http://localhost:5273/examples/agent-review) объединяет композер, вложения, источники, события агента, очередь и подтверждение правок. Внутри AgentPanel лентой владеет MessageScroller. При отправке хост создаёт ID пользовательского сообщения и ID ответа, который сохраняется до конца генерации. Демонстрация использует локальный поток данных.

Обе production-сборки, типы, ESLint, Stylelint, форматирование и четыре пакетных теста прошли. В Chromium прошли 36 сценариев, включая axe на пяти маршрутах в двух темах, работу клавиатуры, длинные диалоги, сохранение ширины панелей, вложенность дерева и чтение истории во время стриминга. Firefox и WebKit в этом прогоне не проверялись.

### Сверка с реализацией

Таблица ниже относится к публичному пакету `@chulane/ui` и демо `ui-catalog`. Записи о количестве тестов выше отражают предыдущие этапы.

| Область плана | Что использует библиотека | Как проверить поведение |
|---|---|---|
| Foundation и CSS | Checkbox + Field, NativeSelect, ToggleGroup, Button, ButtonGroup, Badge, Separator, Tooltip, Empty, Alert, Spinner. Chip использует Button. `globals.css` связывает тему shadcn с токенами Chulane. | В [каталоге](http://localhost:5273/components) проверить mixed/disabled, клавиатуру, grouped/separate и ThemeScope с порталом. |
| Окна и прокрутка | Именованные Dialog, AlertDialog и CommandDialog. ScrollArea для списков, меню, вкладок и содержимого окон. У ленты агента собственный MessageScroller. | Закрыть окно по Escape, прокрутить длинное содержимое, проверить возврат фокуса. |
| Workspace и навигация | Resizable в демо. Sidebar собирает header/group/footer и FileTree на Collapsible + Button. Компактный раздел открывает то же дерево в Popover. Пункт дерева и список страниц используют ContextMenu с теми же действиями, что и кнопка меню. | В [рабочем пространстве](http://localhost:5273/examples/knowledge-workspace) изменить ширину, переключить режим, открыть вложенную страницу, вызвать меню строки по Shift+F10. |
| Страницы и команды | PageBrowser объединяет поиск, фильтр, сортировку, список/сетку и создание. PageRow использует Item + Button. Палитра получает команды Create, Page actions, View и Appearance из тех же определений, что и меню, и выводит их через CommandGroup. | Открыть палитру по Ctrl/Cmd+K, найти Move to trash, отменить действие. Повторить из контекстного меню и подтвердить его в AlertDialog. |
| Документ и взаимодействие | Breadcrumb и BreadcrumbSeparator, группы команд, вкладки, metadata, контекстные и slash-команды. Выделение текста, действия блока и содержимое принадлежат хосту. | В [редакторе](http://localhost:5273/examples/document-editor) ввести /, набрать имя команды, нажать Enter. Проверить историю текущей вкладки, изображение профиля высот и его атрибуцию. |
| Композер, история, очередь | InputGroup, Attachment, меню модели и режима, Message/Bubble, MessageScroller, Item и ButtonGroup. Пользовательское сообщение и ответ получают отдельные ID от хоста, ID ответа сохраняется во время стриминга. | В [чате](http://localhost:5273/examples/agent-review) отправить, остановить, отредактировать очередь, перейти в другой разговор и вернуться к черновику. |
| Источники и работа агента | InlineCitation использует HoverCard, Sources и ActivityTrace — TraceCollapsible. Типизированные события reasoning/tool/task/plan показывают данные, переданные хостом, включая статус и вход/выход инструмента. | Раскрыть Read entry на [странице ActivityTrace](http://localhost:5273/components/activity-trace). |
| Проверка изменений | Группа и diff используют Collapsible; у каждой правки есть Item, статус и доступные в этом состоянии действия. Счётчик вычисляется по подтверждённому состоянию хоста. | В [ChangeReview](http://localhost:5273/components/change-review) раскрыть diff, применить изменение и отменить его. В примере агента включить ошибку подтверждения и повторить операцию. |
| Поставка и демонстрация | 45 страниц с JSX-примером, TypeScript API и описанием взаимодействия. Пакет экспортирует ESM и декларации через `@chulane/ui`, а общий CSS через `@chulane/ui/styles.css`. | Пакетные тесты проверяют публичные экспорты, покрытие каталогом и реэкспорты в index.ts; Playwright проходит реальные маршруты и действия. |

AI Elements здесь — композиции интерфейса над данными приложения. Поток ответов и операции редактора в каталоге выполняет локальный демонстрационный хост. Семантическая разметка документа (article, figure, figcaption, dl, ссылки) остаётся нативной. Исходный PNG по-прежнему недоступен для попиксельной сверки.

После сверки прошли установка с frozen lockfile, сборки библиотеки и каталога, проверка типов, форматирование, 4 пакетных теста и 42 сценария Chromium. Axe проверен на пяти маршрутах в светлой и тёмной темах. ESLint и Stylelint завершились без ошибок; ESLint сообщил 28 предупреждений о длине функций. Firefox и WebKit в этом прогоне не проверялись.

Исходники в `packages/chulane_ui/src/components/ui`, сгенерированный `use-mobile.ts` и демо-компонент `resizable.tsx` принадлежат реестру shadcn/ui. При обновлении используем CLI с пресетом из `components.json`. Настройки темы, контейнеры порталов, поведение форм и панелей принадлежат компонентам Chulane и каталогу.

### Меню и раскрывающиеся секции каталога

| Где | Что открывается |
| --- | --- |
| Workspace и сайдбар | Переключение workspace, настройки навигации и разделов, дерево проектов, меню строк и контекстные меню. |
| Рабочая область и страницы | Создание, действия страницы, навигация, вид и оформление, фильтр и сортировка. |
| Редактор | Действия документа, история, вставка и преобразование блока, форматирование и действия выделения. |
| Агент | Настройки агента, контекст, режим и модель. Разговоры переключаются вкладками со статусом генерации. Changes, Sources и Activity раскрываются в самом сообщении. |
| Формы каталога | Обычные поля выбора темы и значений настроек используют NativeSelect. |
