const features = [
  {
    title: "Worldwide Tracking",
    description:
      "Follow your delivery across borders and through every stage of its journey.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.8 9h16.4M3.8 15h16.4M12 3.5c2 2.1 3 5 3 8.5s-1 6.4-3 8.5c-2-2.1-3-5-3-8.5s1-6.4 3-8.5Z" />
      </svg>
    ),
  },
  {
    title: "Live Updates",
    description:
      "See the latest status and location details in one clear delivery timeline.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
        <path d="M4 4v4.6h4.6M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    title: "Secure Tracking",
    description:
      "Your delivery details are shared through a private tracking reference built for you.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2.5" />
      </svg>
    ),
  },
];

function ParcelMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="m6.5 10 9.5-5 9.5 5-9.5 5-9.5-5Z" />
        <path d="M6.5 10v11L16 27l9.5-6V10M16 15v12M11 7.6l9.5 5" />
      </svg>
    </span>
  );
}

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ParcelTrack home">
          <ParcelMark />
          <span>ParcelTrack</span>
        </a>
        <span className="header-note">Delivery, made clear.</span>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-dot" /> Simple package tracking
              </p>
              <h1 id="hero-title">
                Your delivery,
                <span>every step of the way.</span>
              </h1>
              <p className="hero-intro">
                Enter your private tracking reference to follow your package from
                dispatch to your doorstep.
              </p>

              <form className="tracking-form" action="#" method="get">
                <label htmlFor="tracking-reference">Tracking reference</label>
                <div className="input-row">
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" />
                      <path d="M3.5 7v10L12 21l8.5-4V7M12 11v10" />
                    </svg>
                    <input
                      id="tracking-reference"
                      name="trackingReference"
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. PT-4829-1756"
                      aria-describedby="tracking-hint"
                    />
                  </div>
                  <button type="submit">
                    Track package
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m7 4 6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <p id="tracking-hint">
                  You’ll find your reference in the private link shared with you.
                </p>
              </form>
            </div>

            <div className="journey-visual" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="visual-card">
                <div className="card-topline">
                  <span>In transit</span>
                  <span className="live-pill">On schedule</span>
                </div>
                <div className="route">
                  <span className="route-point complete" />
                  <span className="route-line complete" />
                  <span className="route-point active" />
                  <span className="route-line" />
                  <span className="route-point" />
                </div>
                <div className="route-labels">
                  <span>Dispatched</span>
                  <span>On the way</span>
                  <span>Delivered</span>
                </div>
                <div className="status-panel">
                  <span className="status-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 8h10v9H4zM14 11h3l3 3v3h-6z" />
                      <circle cx="8" cy="18" r="1.5" />
                      <circle cx="17" cy="18" r="1.5" />
                    </svg>
                  </span>
                  <span>
                    <small>Latest update</small>
                    Package is moving to the next facility
                  </span>
                </div>
              </div>
              <span className="floating-pin pin-one" />
              <span className="floating-pin pin-two" />
              <span className="floating-pin pin-three" />
            </div>
          </div>
        </section>

        <section className="features" aria-labelledby="features-title">
          <div className="section-heading">
            <p className="eyebrow">Clarity at every mile</p>
            <h2 id="features-title">Tracking you can trust</h2>
            <p>Everything you need to follow your package with confidence.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#top" aria-label="ParcelTrack home">
          <ParcelMark />
          <span>ParcelTrack</span>
        </a>
        <p>Clear updates for every delivery.</p>
        <p>© {new Date().getFullYear()} ParcelTrack</p>
      </footer>
    </div>
  );
}

