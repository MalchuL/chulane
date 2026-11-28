/** Browser entry point for the English Chulane UI reference and examples. */
import { ScrollArea } from "chulane_ui";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Layers, PanelLeft, ArrowUpRight, LayoutGrid } from "lucide-react";
import { SelectField, useTheme, IconButton, Dialog } from "chulane_ui";
import { registry } from "./docs/registry";
import { ComponentPage } from "./docs/component-page";
import { examples } from "./examples/registry";
import { Directory } from "./docs/directory";
import { ComponentIndex } from "./docs/component-index";
export function Catalog() {
  const surfaceCatalogClassName = "cu-surface catalog";
  const widthProbeClassName = "catalog-width-probe";
  const skipLinkClassName = "skip-link";
  const headerClassName = "catalog-header";
  const brandClassName = "catalog-brand";
  const headerNavClassName = "catalog-header-nav";
  const spacerClassName = "cu-spacer";
  const mobileClassName = "catalog-mobile";
  const layoutClassName = "catalog-layout";
  const navClassName = "catalog-nav";
  const mainClassName = "catalog-main";
  const crumbClassName = "catalog-crumb";
  const leadClassName = "catalog-lead";
  const cardsClassName = "catalog-cards";
  const probe = useRef<HTMLSpanElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = probe.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setNarrow(document.documentElement.clientWidth <= node.offsetWidth),
    );
    observer.observe(document.documentElement);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const path = location.pathname.replace(/\/$/, "");
  const [, section = "components", slug] = path.split("/");
  const item = registry.find((i) => i.slug === slug);
  const example = examples.find((e) => e.slug === slug);
  const [query, setQuery] = useState("");
  const [nav, setNav] = useState(false);
  const theme = useTheme();
  const navigation = <Directory query={query} setQuery={setQuery} activeSlug={item?.slug} />;
  let content;
  if (section === "examples") {
    if (example?.slug === "knowledge-workspace") {
      content = (
        <article className="catalog-workspace-demo">
          <h1>{example.title}</h1>
          <example.view />
        </article>
      );
    } else if (example) {
      content = (
        <article>
          <div className={crumbClassName}>
            <a href="/examples">Examples</a> / {example.title}
          </div>
          <h1>{example.title}</h1>
          <p className={leadClassName}>{example.description}</p>
          <div
            className={
              example.slug === "agent-review" ? "catalog-agent-preview" : "catalog-composition"
            }
          >
            <example.view />
          </div>
        </article>
      );
    } else {
      content = (
        <>
          <h1>Examples</h1>
          <p className={leadClassName}>
            See how the components work together in a local knowledge workspace.
          </p>
          <div className={cardsClassName}>
            {examples.map((e) => (
              <a key={e.slug} href={"/examples/" + e.slug}>
                <e.icon />
                <h2>{e.title}</h2>
                <p>{e.description}</p>
                <ArrowUpRight />
              </a>
            ))}
          </div>
        </>
      );
    }
  } else {
    if (item) {
      content = <ComponentPage item={item} />;
    } else {
      if (slug) {
        content = (
          <>
            <h1>Page not found</h1>
            <a href="/components">Browse components</a>
          </>
        );
      } else {
        content = <ComponentIndex />;
      }
    }
  }
  return (
    <div className={surfaceCatalogClassName} data-narrow={narrow}>
      <span ref={probe} className={widthProbeClassName} />
      <a className={skipLinkClassName} href="#content">
        Skip to content
      </a>
      <header className={headerClassName}>
        <a className={brandClassName} href="/components">
          <Layers /> Chulane <span>UI</span>
        </a>
        <div className={headerNavClassName}>
          <a aria-current={section !== "examples" ? "page" : undefined} href="/components">
            <BookOpen />
            Components
          </a>
          <a aria-current={section === "examples" ? "page" : undefined} href="/examples">
            <LayoutGrid />
            Examples
          </a>
        </div>
        <span className={spacerClassName} />
        <SelectField
          label="Color theme"
          options={["System", "Light", "Dark"]}
          value={theme.preference[0].toUpperCase() + theme.preference.slice(1)}
          onChange={(s) => theme.setPreference(s.toLowerCase() as typeof theme.preference)}
        />
        <span className={mobileClassName}>
          <Dialog
            title="Browse components"
            open={nav}
            onOpenChange={setNav}
            trigger={
              <IconButton label="Open directory">
                <PanelLeft />
              </IconButton>
            }
          >
            {navigation}
          </Dialog>
        </span>
      </header>
      <div className={layoutClassName} data-example={section === "examples" && !!example}>
        {!(section === "examples" && example) && (
          <ScrollArea className={navClassName}>
            <aside>{navigation}</aside>
          </ScrollArea>
        )}
        <main id="content" className={mainClassName}>
          {content}
        </main>
      </div>
    </div>
  );
}
