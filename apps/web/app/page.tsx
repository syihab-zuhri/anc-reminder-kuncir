import { landingCopy } from "@/content/id";
import { BrandMark } from "@/components/brand-mark";

function ArrowIcon() {
  return (
    <svg className="arrow-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

export default function HomePage() {
  const { brand, navigation, hero, preview, workflow, access, footer } = landingCopy;

  return (
    <div className="site-shell">
      <a className="skip-link" href="#konten-utama">
        Lewati ke konten utama
      </a>

      <header className="site-header">
        <a className="brand" href="#atas" aria-label="Pengingat ANC, beranda">
          <BrandMark />
          <span className="brand-copy">
            <strong>{brand.name}</strong>
            <span>{brand.descriptor}</span>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Navigasi utama">
          <a href="#cara-kerja">{navigation.workflow}</a>
          <a href="#akses">{navigation.access}</a>
        </nav>

        <a className="header-action" href="/staff/login">
          {navigation.staff}
          <ArrowIcon />
        </a>
      </header>

      <main id="konten-utama">
        <section className="hero" id="atas" aria-labelledby="hero-title">
          <div className="hero-copy reveal reveal-one">
            <p className="eyebrow">
              <span aria-hidden="true">08</span>
              {hero.eyebrow}
            </p>
            <h1 id="hero-title">{hero.title}</h1>
            <p className="hero-description">{hero.description}</p>

            <div className="hero-actions" aria-label="Tautan pengantar">
              <a className="button button-primary" href="#akses">
                {hero.primaryAction}
                <ArrowIcon />
              </a>
              <a className="text-link" href="#cara-kerja">
                {hero.secondaryAction}
              </a>
            </div>

            <p className="privacy-note">
              <span className="privacy-symbol" aria-hidden="true">
                ◉
              </span>
              {hero.privacyNote}
            </p>
          </div>

          <aside className="operations-preview reveal reveal-two" aria-labelledby="preview-title">
            <div className="preview-topline">
              <p>{preview.eyebrow}</p>
              <span className="status-badge">
                <span aria-hidden="true" />
                {preview.badge}
              </span>
            </div>

            <div className="preview-heading">
              <span className="preview-monogram" aria-hidden="true">
                ANC
              </span>
              <div>
                <h2 id="preview-title">{preview.title}</h2>
                <p>{preview.description}</p>
              </div>
            </div>

            <dl className="metric-list">
              {preview.items.map((item) => (
                <div className="metric-row" key={item.label}>
                  <dt>
                    <span>{item.label}</span>
                    <span>{item.note}</span>
                  </dt>
                  <dd className="metric-value" aria-label={`${item.label}: belum ada data`}>
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="preview-footnote">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2.5 17 5v4.7c0 3.8-2.7 6.6-7 7.8-4.3-1.2-7-4-7-7.8V5l7-2.5Z" />
                <path d="m7 10 2 2 4-4" />
              </svg>
              {preview.footnote}
            </p>
          </aside>

          <div className="hero-index" aria-hidden="true">
            K1—K8
          </div>
        </section>

        <section className="workflow-section" id="cara-kerja" aria-labelledby="workflow-title">
          <div className="section-heading reveal reveal-three">
            <p className="eyebrow">{workflow.eyebrow}</p>
            <h2 id="workflow-title">{workflow.title}</h2>
            <p>{workflow.description}</p>
          </div>

          <div className="role-grid">
            {workflow.roles.map((role) => (
              <article className="role-card" key={role.index}>
                <div className="role-card-topline">
                  <span>{role.index}</span>
                  <span className="role-label">{role.label}</span>
                </div>
                <h3>{role.title}</h3>
                <p>{role.description}</p>
                <span className="role-rule" aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="access-section" id="akses" aria-labelledby="access-title">
          <div className="access-copy">
            <p className="eyebrow">{access.eyebrow}</p>
            <h2 id="access-title">{access.title}</h2>
            <p>{access.description}</p>
          </div>

          <div className="access-options" aria-label="Pilihan akses mendatang">
            <a className="access-option access-option-active" href="/staff/login">
              <div>
                <span className="access-number" aria-hidden="true">
                  01
                </span>
                <h3>{access.staffTitle}</h3>
                <p>{access.staffDescription}</p>
              </div>
              <span className="coming-soon access-ready">{access.staffStatus}</span>
            </a>

            <article className="access-option">
              <div>
                <span className="access-number" aria-hidden="true">
                  02
                </span>
                <h3>{access.motherTitle}</h3>
                <p>{access.motherDescription}</p>
              </div>
              <span className="coming-soon">{access.motherStatus}</span>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <BrandMark />
          <p>{footer.statement}</p>
        </div>
        <p>{footer.availability}</p>
      </footer>
    </div>
  );
}
