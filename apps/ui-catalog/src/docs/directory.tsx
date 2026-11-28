/** Searchable navigation shared by the sidebar and its narrow-screen dialog. */
import { Search } from "lucide-react";
import { SearchField } from "chulane_ui";
import { registry } from "./registry";
const families = [...new Set(registry.map((i) => i.family))];
export function Directory({
  query,
  setQuery,
  activeSlug,
}: {
  query: string;
  setQuery: (q: string) => void;
  activeSlug?: string;
}) {
  const searchClassName = "catalog-search";
  const matching = registry.filter((i) =>
    (i.name + " " + i.family + " " + i.description).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className={searchClassName}>
        <Search />
        <SearchField
          label="Find components"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav aria-label="Component directory">
        <a href="/components">Component index</a>
        <a href="/examples">Examples</a>
        {families.map((f) => (
          <section key={f} hidden={!matching.some((i) => i.family === f)}>
            <h2>{f}</h2>
            {matching
              .filter((i) => i.family === f)
              .map((i) => (
                <a
                  key={i.slug}
                  aria-current={i.slug === activeSlug ? "page" : undefined}
                  href={"/components/" + i.slug}
                >
                  {i.name}
                </a>
              ))}
          </section>
        ))}
        {!matching.length && <p>No matching components</p>}
      </nav>
    </>
  );
}
